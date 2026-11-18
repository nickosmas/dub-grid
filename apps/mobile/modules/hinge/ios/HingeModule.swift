import ExpoModulesCore
import UIKit

// Reports the iPhone Duo's hinge (iOS 27.1's UIHingeInteraction) so the app
// can split its panes at the fold. Anything without a hinge reports
// "unknown".
public class HingeModule: Module {
  private var status = "unknown"
  private var interaction: UIInteraction?
  private weak var host: UIView?

  public func definition() -> ModuleDefinition {
    Name("Hinge")

    Events("onChange")

    Function("getStatus") { () -> String in
      self.status
    }

    OnStartObserving {
      DispatchQueue.main.async { self.attach() }
    }

    OnStopObserving {
      DispatchQueue.main.async { self.detach() }
    }
  }

  private func attach() {
    guard interaction == nil, let window = keyWindow() else { return }
    guard #available(iOS 27.1, *) else { return }
    let hingeInteraction = UIHingeInteraction { [weak self] _, update in
      self?.report(update.hinge?.status)
    }
    window.addInteraction(hingeInteraction)
    interaction = hingeInteraction
    host = window
  }

  private func detach() {
    if let interaction, let host {
      host.removeInteraction(interaction)
    }
    interaction = nil
    host = nil
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
