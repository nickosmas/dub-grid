import ExpoModulesCore
import UIKit

// UIKit's own search field, the one inside every system search bar, as a
// view a page can place where it likes. An iPhone Duo's split puts a list's
// search above that list, where the navigation bar's search can't go: the
// bar spans both panes.
public class SearchFieldModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SearchField")

    View(SearchFieldView.self) {
      Events("onChangeText")

      Prop("placeholder") { (view: SearchFieldView, value: String) in
        view.field.placeholder = value
      }
    }
  }
}

final class SearchFieldView: ExpoView, UISearchTextFieldDelegate {
  let field = UISearchTextField()
  let onChangeText = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    field.returnKeyType = .search
    field.clearButtonMode = .whileEditing
    field.autocorrectionType = .no
    field.autocapitalizationType = .none
    field.delegate = self
    field.addTarget(self, action: #selector(changed), for: .editingChanged)
    addSubview(field)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    field.frame = bounds
  }

  @objc private func changed() {
    onChangeText(["text": field.text ?? ""])
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    textField.resignFirstResponder()
    return true
  }
}
