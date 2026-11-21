import ExpoModulesCore
import UIKit

// UIKit's search field (`_UISearchBarTextFieldTokenCounter`, behind every
// UISearchTextField and UISearchBar) observes its text storage's
// NSTextStorageDidProcessEditingNotification on the main queue and never
// removes the observer. Once that storage is freed, React Native's text
// measurement, which runs off the main thread, can create an NSTextStorage at
// the same address: its notification then matches the stale observer, and the
// post waits for the main queue. On iOS 27 the main thread was waiting for
// React Native's text-measure lock at that moment (a fold or open of the
// iPhone Duo), so the app froze for good.
//
// Observers of that notification that asked for the main queue are registered
// without one, and run on the main thread: at once when posted there, and
// otherwise dispatched to it without the poster waiting.
enum TextStorageObserverGuard {
  private static var installed = false

  static func install() {
    guard !installed else { return }
    installed = true
    let center: AnyClass = NotificationCenter.self
    guard
      let original = class_getInstanceMethod(
        center, #selector(NotificationCenter.addObserver(forName:object:queue:using:))),
      let guarded = class_getInstanceMethod(
        center, #selector(NotificationCenter.dubgrid_addObserver(forName:object:queue:using:)))
    else { return }
    method_exchangeImplementations(original, guarded)
  }
}

extension NotificationCenter {
  @objc dynamic func dubgrid_addObserver(
    forName name: NSNotification.Name?,
    object: Any?,
    queue: OperationQueue?,
    using block: @escaping @Sendable (Notification) -> Void
  ) -> NSObjectProtocol {
    // After the exchange, this name calls UIKit's original implementation.
    guard name == NSTextStorage.didProcessEditingNotification, queue === OperationQueue.main else {
      return dubgrid_addObserver(forName: name, object: object, queue: queue, using: block)
    }
    return dubgrid_addObserver(forName: name, object: object, queue: nil) { note in
      if Thread.isMainThread {
        block(note)
      } else {
        DispatchQueue.main.async { block(note) }
      }
    }
  }
}

public class HingeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    TextStorageObserverGuard.install()
    return true
  }
}
