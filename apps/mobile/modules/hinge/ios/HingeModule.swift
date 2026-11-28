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
// that gap and fades once JavaScript calls `settle()`, or after 2.5 seconds.
public class HingeModule: Module {
  private var status = "unknown"
  private var interaction: UIInteraction?
  private weak var host: UIWindow?
  private var sentinel: SizeSentinel?
  private var cover: UIView?
  private var keyWindowObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("Hinge")

    Events("onChange")

    Function("getStatus") { () -> String in
      self.status
    }

    Function("settle") {
      DispatchQueue.main.async { self.reveal(after: 0.05) }
    }

    // A split view's detail pane: its scroll views get iOS's soft top edge
    // effect, which only shows once content scrolls under the bar. Screens
    // sets the edge effect on the first scroll view it finds, the list's, and
    // iOS gave the pane's its hard one, a band over the pane at rest.
    View(PaneEdgeView.self) {}

    OnStartObserving {
      DispatchQueue.main.async { self.attach() }
    }

    OnStopObserving {
      DispatchQueue.main.async { self.detach() }
    }
  }

  // JavaScript subscribes while the app launches, often before any window is
  // key, and a dev build's launcher window is key before the app's own. The
  // module then watched no window, or a window that went away, and missed
  // every fold until a reload: partly folded, the panes kept the open split.
  // So it follows whichever window becomes key.
  private func attach() {
    if keyWindowObserver == nil {
      keyWindowObserver = NotificationCenter.default.addObserver(
        forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.attach() }
    }
    guard let window = keyWindow(), window !== host else { return }
    detachFromHost()
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
    if let keyWindowObserver {
      NotificationCenter.default.removeObserver(keyWindowObserver)
    }
    keyWindowObserver = nil
    detachFromHost()
  }

  private func detachFromHost() {
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
    // JavaScript normally settles well before this; it's only a backstop. It
    // allows for the inner screen lighting a second or more after the window
    // has resized while opening.
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
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

/// Wraps a split view's pane. It names the pane's page scroll view to the
/// screen it sits in, so that screen's own navigation bar folds its large
/// title and draws its scroll edge as that page scrolls: UIKit's own guess
/// follows only the first subview of each view, which a pane's page doesn't
/// always sit on. It also gives each scroll view the soft top edge effect,
/// stopping at a scroll view rather than searching inside one.
final class PaneEdgeView: ExpoView {
  private weak var registeredScrollView: UIScrollView?

  override func layoutSubviews() {
    super.layoutSubviews()
    if #available(iOS 26.0, *) {
      softenTopEdges(in: self)
    }
    registerContentScrollView()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    registeredScrollView = nil
    setNeedsLayout()
  }

  private func registerContentScrollView() {
    guard let scrollView = pageScrollView(), scrollView !== registeredScrollView,
      let controller = owningViewController()
    else { return }
    controller.setContentScrollView(scrollView, for: .top)
    registeredScrollView = scrollView
  }

  /// The page's own scroll view: the first one at least half the pane's
  /// height, so a strip of chips above the page doesn't take its place.
  private func pageScrollView() -> UIScrollView? {
    var fallback: UIScrollView?
    var queue: [UIView] = subviews
    while !queue.isEmpty {
      let view = queue.removeFirst()
      if let scrollView = view as? UIScrollView {
        if scrollView.bounds.height >= bounds.height / 2 { return scrollView }
        if fallback == nil { fallback = scrollView }
        continue
      }
      queue.append(contentsOf: view.subviews)
    }
    return fallback
  }

  private func owningViewController() -> UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }

  @available(iOS 26.0, *)
  private func softenTopEdges(in view: UIView) {
    for child in view.subviews {
      if let scrollView = child as? UIScrollView {
        if scrollView.topEdgeEffect.style != .soft {
          scrollView.topEdgeEffect.style = .soft
        }
      } else {
        softenTopEdges(in: child)
      }
    }
  }
}
