# Epic 244: iOS Admin Custom Fields Management

## Summary

Add a Custom Fields management tab to the iOS admin panel. Admins define fields (text, number, select, checkbox, textarea) that appear on note and report creation forms. The iOS app already renders custom fields in NoteCreateView — this epic adds the admin UI to define/edit/delete those field definitions.

## Context

- **Android has**: CustomFieldsTab in admin panel — full CRUD with field type picker, options management for select fields, visibility/editability toggles
- **iOS has**: NoteCreateView already renders custom fields from `CustomFieldDefinition` model. The `CustomField.swift` model exists. What's missing is the admin UI to manage these definitions.
- **API**: `GET /api/settings/custom-fields?role=admin` and `PUT /api/settings/custom-fields` (replaces entire field list)
- **Existing model**: `apps/ios/Sources/Models/CustomField.swift` already has `CustomFieldDefinition`

## Current State

The `CustomFieldDefinition` model already exists:
```swift
struct CustomFieldDefinition: Identifiable, Codable {
    let id: String
    var name: String
    var label: String
    var type: String           // "text", "number", "checkbox", "select", "textarea"
    var required: Bool
    var options: [FieldOption]?
    var description: String?
    // ... other fields
}
```

## Views

### Add "Custom Fields" Tab to AdminTabView

Extend `AdminTab` enum with `.customFields` case. Add a 5th segment to the picker.

### CustomFieldsView.swift — Field List

- **List of field cards**: Each shows label, type chip, context chip (notes/reports/all), required badge
- **Toolbar**: "Add Field" button (plus icon)
- **Swipe-to-delete**: With confirmation
- **Tap to edit**: Opens edit sheet
- **Empty state**: "No Custom Fields" with "Add First Field" button
- **Accessibility**: `custom-fields-list`, `custom-fields-empty-state`, `add-field-button`, `field-row-{id}`

### CustomFieldEditView.swift — Create/Edit Sheet

Form sheet for creating or editing a field:
- **Label**: TextField (required) — auto-generates `name` slug
- **Type**: Picker (text, number, select, checkbox, textarea)
- **Context**: Picker (notes, reports, all)
- **Required**: Toggle
- **Visible to volunteers**: Toggle
- **Editable by volunteers**: Toggle
- **Options section** (only for select/multiselect type):
  - List of current options with delete buttons
  - TextField + "Add" button for new options
- **Save button**: Disabled until label is filled
- **Accessibility**: `field-label-input`, `field-type-picker`, `field-context-picker`, `field-required-toggle`, `field-save-button`, `add-option-button`

## ViewModel Extension

Add custom fields state to `AdminViewModel`:

```swift
// In AdminViewModel
var customFields: [CustomFieldDefinition] = []
var isLoadingFields = false
var showFieldEditor = false
var editingField: CustomFieldDefinition?

func loadCustomFields() async { /* GET /api/settings/custom-fields?role=admin */ }
func saveField(_ field: CustomFieldDefinition) async { /* Update array + PUT */ }
func deleteField(id: String) async { /* Remove from array + PUT */ }
```

The PUT endpoint replaces the entire field list, so save/delete operations modify the local array then PUT the whole thing.

## BDD Tests — AdminCustomFieldsUITests.swift

```
Scenario: Custom fields tab shows in admin panel
  Given I am authenticated as admin with API
  When I navigate to admin panel
  Then I should see the custom fields tab

Scenario: Custom fields empty state
  Given I am authenticated as admin with API
  When I navigate to custom fields tab
  Then I should see the custom fields empty state or field list

Scenario: Create a new text field
  Given I am authenticated as admin with API
  When I navigate to custom fields tab
  And I tap add field
  And I fill in field label "Caller Mood"
  And I select field type "text"
  And I save the field
  Then I should see "Caller Mood" in the fields list

Scenario: Create a select field with options
  Given I am authenticated as admin with API
  When I create a select field "Priority" with options "Low,Medium,High"
  Then I should see "Priority" in the fields list

Scenario: Delete a custom field
  Given I am authenticated as admin with API
  And a custom field "Test Field" exists
  When I delete "Test Field"
  Then "Test Field" should no longer appear
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `Sources/Views/Admin/CustomFieldsView.swift` | Create |
| `Sources/Views/Admin/CustomFieldEditView.swift` | Create |
| `Sources/Views/Admin/AdminTabView.swift` | Modify — add .customFields tab |
| `Sources/ViewModels/AdminViewModel.swift` | Modify — add custom fields state |
| `Tests/UI/AdminCustomFieldsUITests.swift` | Create |

## Dependencies

- Epic 240 (Docker test infra) for live API tests
- Existing CustomFieldDefinition model
- Admin role required
