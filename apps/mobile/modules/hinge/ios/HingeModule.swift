import ExpoModulesCore
import UIKit

// Reports the iPhone Duo's hinge (iOS 27.1's UIHingeInteraction) so the app
// can split its panes at the fold. Anything without a hinge reports
// "unknown".
//
// It also covers the window while it changes size. iOS resizes the window,
// and React Native lays the old views out at the new size, a frame before
// JavaScript hears of it and draws the new layout; on the Duo that showed
// the open split clipped on the closed screen, and the phone's week strip
// stretched across the open one. A blurred picture of the last frame covers
// that gap and fades once JavaScript calls `settle()`, or after a moment.
public class HingeModule: Module {
  private var status = "unknown"
  private var interaction: UIInteraction?
  private weak var host: UIWindow?
  private var sentinel: SizeSentinel?
  private var cover: UIView?

  public func definition() -> ModuleDefinition {
    Name("Hinge")

    Events("onChange")

    Function("getStatus") { () -> String in
      self.status
    }

    Function("settle") {
      DispatchQueue.main.async { self.reveal(after: 0.05) }
    }

    OnStartObserving {
      DispatchQueue.main.async { self.attach() }
    }

    OnStopObserving {
      DispatchQueue.main.async { self.detach() }
    }
  }

  private func attach() {
    guard host == nil, let window = keyWindow() else { return }
    host = window

    let sentinel = SizeSentinel(frame: window.bounds)
    sentinel.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sentinel.isUserInteractionEnabled = false
    sentinel.onResize = { [weak self] old, new in self?.coverResize(from: old, to: new) }
    window.insertSubview(sentinel, at: 0)
    self.sentinel = sentinel

    guard #available(iOS 27.1, *) else { return }
    let hingeInteraction = UIHingeInteraction { [weak self] _, update in
      self?.report(update.hinge?.status)
    }
    window.addInteraction(hingeInteraction)
    interaction = hingeInteraction
  }

  private func detach() {
    if let interaction, let host {
      host.removeInteraction(interaction)
    }
    sentinel?.removeFromSuperview()
    cover?.removeFromSuperview()
    interaction = nil
    sentinel = nil
    cover = nil
    host = nil
  }

  private func coverResize(from old: CGSize, to new: CGSize) {
    guard let window = host, cover == nil, old.width > 0, old.height > 0 else { return }
    guard abs(old.width - new.width) > 1 || abs(old.height - new.height) > 1 else { return }

    let cover = UIView(frame: window.bounds)
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cover.backgroundColor = window.rootViewController?.view.backgroundColor ?? .systemBackground
    cover.clipsToBounds = true

    // The last frame, scaled to fill the new size and blurred, so the change
    // reads as the old page dissolving into the new one.
    if let picture = window.snapshotView(afterScreenUpdates: false) {
      let scale = max(new.width / old.width, new.height / old.height)
      let size = CGSize(width: old.width * scale, height: old.height * scale)
      picture.frame = CGRect(
        x: (new.width - size.width) / 2,
        y: (new.height - size.height) / 2,
        width: size.width,
        height: size.height
      )
      cover.addSubview(picture)
    }
    let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
    blur.frame = cover.bounds
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cover.addSubview(blur)

    window.addSubview(cover)
    self.cover = cover
    // JavaScript normally settles well before this; it's only a backstop.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in
      self?.reveal(after: 0)
    }
  }

  private func reveal(after delay: TimeInterval) {
    guard let cover else { return }
    self.cover = nil
    UIView.animate(
      withDuration: 0.3,
      delay: delay,
      options: [.curveEaseOut, .beginFromCurrentState],
      animations: { cover.alpha = 0 },
      completion: { _ in cover.removeFromSuperview() }
    )
  }

  @available(iOS 27.1, *)
  private func report(_ hingeStatus: UIHinge.Status?) {
    let next: String
    switch hingeStatus {
    case .closed: next = "closed"
    case .partiallyOpen: next = "partiallyOpen"
    case .fullyOpen: next = "fullyOpen"
    default: next = "unknown"
    }
    guard next != status else { return }
    status = next
    sendEvent("onChange", ["status": next])
  }

  private func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }
}

/// An invisible view that fills the window and reports when its size changes,
/// in the layout pass that resizes it, before that frame is drawn.
private final class SizeSentinel: UIView {
  var onResize: ((CGSize, CGSize) -> Void)?

  override var frame: CGRect {
    didSet {
      if oldValue.size != frame.size { onResize?(oldValue.size, frame.size) }
    }
  }

  override var bounds: CGRect {
    didSet {
      if oldValue.size != bounds.size { onResize?(oldValue.size, bounds.size) }
    }
  }
}
