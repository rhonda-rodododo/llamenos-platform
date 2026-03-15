# Case Management System — Template Catalog

**Date**: 2026-03-14
**Status**: DRAFT — evolving as research completes
**Purpose**: Define the pre-built template packages that ship with Llamenos. Each template
bootstraps a hub's case management configuration for a specific use case. Templates
are stored as JSON in `packages/protocol/templates/` and applied during hub setup.

---

## Template Infrastructure

### File Location

```
packages/protocol/templates/
  jail-support.json
  nlg-legal-observer.json
  ice-rapid-response.json
  street-medic.json
  bail-fund.json
  dv-crisis.json
  anti-trafficking.json
  hate-crime-reporting.json
  copwatch.json
  tenant-organizing.json
  mutual-aid.json
  missing-persons.json
  general-hotline.json
  template-schema.json              # JSON Schema for template validation
```

### Template Validation

Templates are validated at build time against `template-schema.json`:

```bash
bun run templates:validate           # Validate all templates
bun run templates:validate:single    # Validate a single template
```

### Template Application API

```
POST /api/settings/templates/apply
Body: { templateId: string, overrides?: Partial<CaseManagementTemplate> }

# Returns the created entity types, relationship types, and suggested roles
```

### Template Composition

Templates can extend other templates:

```json
{
  "id": "jail-support",
  "extends": ["nlg-legal-observer"],
  "entityTypes": [
    // Inherits all entity types from nlg-legal-observer
    // Adds/overrides specific types
  ]
}
```

When extending, the behavior is:
- Entity types with the same `name` MERGE (child fields added to parent fields)
- Entity types with new `name` are ADDED
- Relationship types follow the same merge/add pattern
- i18n labels deep-merge (child overrides parent for matching keys)

---

## Template #1: Jail Support

The most immediately useful template for the Llamenos use case. Covers arrest intake,
arraignment tracking, release coordination, and attorney matching.

```json
{
  "id": "jail-support",
  "version": "1.0.0",
  "name": "Jail Support",
  "description": "Mass arrest intake, arraignment tracking, bail coordination, and release monitoring. Designed for NLG hotlines and jail support operations.",
  "author": "Llamenos Project",
  "license": "CC-BY-SA-4.0",
  "tags": ["legal", "protest", "jail-support", "mass-arrest"],

  "labels": {
    "en": {
      "arrest_case.label": "Arrest Case",
      "arrest_case.labelPlural": "Arrest Cases",
      "arrest_case.description": "Track an individual through the arrest and release process",
      "mass_arrest_event.label": "Mass Arrest Event",
      "mass_arrest_event.labelPlural": "Mass Arrest Events",
      "status.reported": "Reported",
      "status.confirmed": "Confirmed",
      "status.in_custody": "In Custody",
      "status.arraigned": "Arraigned",
      "status.released": "Released",
      "status.case_closed": "Case Closed",
      "severity.urgent": "Urgent",
      "severity.standard": "Standard",
      "severity.low": "Low Priority",
      "role.arrestee": "Arrestee",
      "role.attorney": "Attorney",
      "role.support_contact": "Support Contact",
      "role.legal_observer": "Legal Observer",
      "field.arrest_location": "Arrest Location",
      "field.arrest_time": "Arrest Time",
      "field.arresting_agency": "Arresting Agency",
      "field.precinct": "Precinct / Station",
      "field.booking_number": "Booking Number",
      "field.charges": "Charges",
      "field.bail_amount": "Bail Amount",
      "field.bail_status": "Bail Status",
      "field.court_date": "Court Date",
      "field.courtroom": "Courtroom",
      "field.attorney_status": "Attorney Status",
      "field.attorney_name": "Attorney Name",
      "field.medical_needs": "Medical Needs",
      "field.medical_details": "Medical Details",
      "field.release_status": "Release Status",
      "field.release_time": "Release Time",
      "field.physical_description": "Physical Description",
      "field.property_seized": "Property Seized",

      "lo_arrest_report.label": "LO Arrest Report",
      "lo_arrest_report.labelPlural": "LO Arrest Reports",
      "lo_arrest_report.description": "Legal observer field report listing arrested individuals. Submit one report with all names — jail support creates individual cases later.",
      "lo_misconduct_report.label": "LO Misconduct Report",
      "lo_misconduct_report.labelPlural": "LO Misconduct Reports",
      "lo_misconduct_report.description": "Legal observer report of police misconduct, excessive force, or abuse. Attach photos and video for lawsuit evidence.",

      "status.submitted": "Submitted",
      "status.in_review": "In Review",
      "status.cases_created": "Cases Created",
      "status.reviewed": "Reviewed",
      "status.evidence_preserved": "Evidence Preserved",

      "field.location": "Location",
      "field.time": "Time",
      "field.agency": "Agency",
      "field.estimated_count": "Estimated Arrest Count",
      "field.arrestee_details": "Arrestee Details",
      "field.general_notes": "General Notes",
      "field.badge_numbers": "Badge Numbers",
      "field.force_type": "Force Type",
      "field.description": "Description"
    },
    "es": {
      "arrest_case.label": "Caso de Arresto",
      "arrest_case.labelPlural": "Casos de Arresto",
      "status.reported": "Reportado",
      "status.confirmed": "Confirmado",
      "status.in_custody": "En Custodia",
      "status.arraigned": "Procesado",
      "status.released": "Liberado",
      "status.case_closed": "Caso Cerrado",

      "lo_arrest_report.label": "Reporte de Arrestos (OL)",
      "lo_arrest_report.labelPlural": "Reportes de Arrestos (OL)",
      "lo_misconduct_report.label": "Reporte de Abuso Policial (OL)",
      "lo_misconduct_report.labelPlural": "Reportes de Abuso Policial (OL)",
      "status.submitted": "Enviado",
      "status.in_review": "En Revisión",
      "status.cases_created": "Casos Creados",
      "field.arrestee_details": "Detalles de Arrestados",
      "field.badge_numbers": "Números de Placa",
      "field.force_type": "Tipo de Fuerza"
    }
  },

  "entityTypes": [
    {
      "name": "arrest_case",
      "label": "arrest_case.label",
      "labelPlural": "arrest_case.labelPlural",
      "description": "arrest_case.description",
      "icon": "handcuffs",
      "color": "#ef4444",
      "category": "case",
      "numberPrefix": "JS",
      "numberingEnabled": true,
      "defaultAccessLevel": "assigned",
      "piiFields": ["attorney_name", "physical_description"],
      "allowSubRecords": false,
      "allowFileAttachments": true,
      "allowInteractionLinks": true,
      "showInNavigation": true,
      "showInDashboard": true,

      "statuses": [
        { "value": "reported", "label": "status.reported", "color": "#f59e0b", "order": 1 },
        { "value": "confirmed", "label": "status.confirmed", "color": "#3b82f6", "order": 2 },
        { "value": "in_custody", "label": "status.in_custody", "color": "#ef4444", "order": 3 },
        { "value": "arraigned", "label": "status.arraigned", "color": "#8b5cf6", "order": 4 },
        { "value": "released", "label": "status.released", "color": "#22c55e", "order": 5 },
        { "value": "case_closed", "label": "status.case_closed", "color": "#6b7280", "order": 6, "isClosed": true }
      ],
      "defaultStatus": "reported",
      "closedStatuses": ["case_closed"],

      "severities": [
        { "value": "urgent", "label": "severity.urgent", "color": "#ef4444", "icon": "alert-triangle", "order": 1 },
        { "value": "standard", "label": "severity.standard", "color": "#3b82f6", "order": 2 },
        { "value": "low", "label": "severity.low", "color": "#6b7280", "order": 3 }
      ],
      "defaultSeverity": "standard",

      "contactRoles": [
        { "value": "arrestee", "label": "role.arrestee", "order": 1 },
        { "value": "attorney", "label": "role.attorney", "order": 2 },
        { "value": "support_contact", "label": "role.support_contact", "order": 3 },
        { "value": "legal_observer", "label": "role.legal_observer", "order": 4 }
      ],

      "fields": [
        {
          "name": "arrest_location",
          "label": "field.arrest_location",
          "type": "text",
          "required": true,
          "section": "arrest_details",
          "order": 1,
          "indexable": false,
          "accessLevel": "all"
        },
        {
          "name": "arrest_time",
          "label": "field.arrest_time",
          "type": "text",
          "required": true,
          "section": "arrest_details",
          "order": 2,
          "indexable": false,
          "accessLevel": "all"
        },
        {
          "name": "arresting_agency",
          "label": "field.arresting_agency",
          "type": "select",
          "required": true,
          "options": ["NYPD", "State Police", "Federal", "ICE/CBP", "Other"],
          "section": "arrest_details",
          "order": 3,
          "indexable": true,
          "indexType": "exact",
          "accessLevel": "all"
        },
        {
          "name": "precinct",
          "label": "field.precinct",
          "type": "text",
          "required": false,
          "section": "processing",
          "order": 4,
          "indexable": false,
          "accessLevel": "assigned"
        },
        {
          "name": "booking_number",
          "label": "field.booking_number",
          "type": "text",
          "required": false,
          "section": "processing",
          "order": 5,
          "indexable": true,
          "indexType": "exact",
          "accessLevel": "assigned"
        },
        {
          "name": "charges",
          "label": "field.charges",
          "type": "textarea",
          "required": false,
          "section": "legal",
          "helpText": "List all known charges. Update as charges change.",
          "order": 6,
          "indexable": false,
          "accessLevel": "assigned"
        },
        {
          "name": "bail_amount",
          "label": "field.bail_amount",
          "type": "number",
          "required": false,
          "section": "bail",
          "order": 7,
          "indexable": false,
          "accessLevel": "assigned"
        },
        {
          "name": "bail_status",
          "label": "field.bail_status",
          "type": "select",
          "required": false,
          "options": ["Not Set", "Cash Bail", "Posted", "ROR", "Remanded", "Unknown"],
          "section": "bail",
          "order": 8,
          "indexable": true,
          "indexType": "exact",
          "accessLevel": "assigned"
        },
        {
          "name": "court_date",
          "label": "field.court_date",
          "type": "text",
          "required": false,
          "section": "court",
          "order": 9,
          "indexable": false,
          "accessLevel": "assigned"
        },
        {
          "name": "courtroom",
          "label": "field.courtroom",
          "type": "text",
          "required": false,
          "section": "court",
          "order": 10,
          "indexable": false,
          "accessLevel": "assigned"
        },
        {
          "name": "attorney_status",
          "label": "field.attorney_status",
          "type": "select",
          "required": true,
          "options": ["Needs Attorney", "Has Attorney", "Declined", "Unknown"],
          "section": "legal",
          "order": 11,
          "indexable": true,
          "indexType": "exact",
          "accessLevel": "all"
        },
        {
          "name": "attorney_name",
          "label": "field.attorney_name",
          "type": "text",
          "required": false,
          "section": "legal",
          "order": 12,
          "indexable": false,
          "accessLevel": "admin",
          "showWhen": { "field": "attorney_status", "operator": "equals", "value": "Has Attorney" }
        },
        {
          "name": "medical_needs",
          "label": "field.medical_needs",
          "type": "checkbox",
          "required": false,
          "section": "medical",
          "order": 13,
          "indexable": true,
          "indexType": "exact",
          "accessLevel": "all"
        },
        {
          "name": "medical_details",
          "label": "field.medical_details",
          "type": "textarea",
          "required": false,
          "section": "medical",
          "order": 14,
          "indexable": false,
          "accessLevel": "assigned",
          "showWhen": { "field": "medical_needs", "operator": "equals", "value": true }
        },
        {
          "name": "release_status",
          "label": "field.release_status",
          "type": "select",
          "required": true,
          "options": ["In Custody", "Released", "Transferred", "Unknown"],
          "section": "release",
          "order": 15,
          "indexable": true,
          "indexType": "exact",
          "accessLevel": "all"
        },
        {
          "name": "release_time",
          "label": "field.release_time",
          "type": "text",
          "required": false,
          "section": "release",
          "order": 16,
          "indexable": false,
          "accessLevel": "assigned",
          "showWhen": { "field": "release_status", "operator": "equals", "value": "Released" }
        },
        {
          "name": "physical_description",
          "label": "field.physical_description",
          "type": "textarea",
          "required": false,
          "section": "identification",
          "helpText": "Physical description for identification when name is unknown.",
          "order": 17,
          "indexable": false,
          "accessLevel": "assigned"
        },
        {
          "name": "property_seized",
          "label": "field.property_seized",
          "type": "textarea",
          "required": false,
          "section": "processing",
          "helpText": "Phone, ID, belongings taken by police.",
          "order": 18,
          "indexable": false,
          "accessLevel": "assigned"
        }
      ]
    },
    {
      "name": "mass_arrest_event",
      "label": "mass_arrest_event.label",
      "labelPlural": "mass_arrest_event.labelPlural",
      "description": "A mass arrest at a specific location and time. Links to individual arrest cases.",
      "icon": "siren",
      "color": "#dc2626",
      "category": "event",
      "numberPrefix": "MA",
      "numberingEnabled": true,
      "defaultAccessLevel": "hub",
      "piiFields": [],
      "allowSubRecords": true,
      "allowFileAttachments": true,
      "allowInteractionLinks": true,
      "showInNavigation": true,
      "showInDashboard": true,

      "statuses": [
        { "value": "active", "label": "Active", "color": "#ef4444", "order": 1 },
        { "value": "processing", "label": "Processing", "color": "#f59e0b", "order": 2 },
        { "value": "completed", "label": "Completed", "color": "#22c55e", "order": 3, "isClosed": true }
      ],
      "defaultStatus": "active",
      "closedStatuses": ["completed"],

      "fields": [
        { "name": "location", "label": "Location", "type": "text", "required": true, "order": 1, "indexable": false, "accessLevel": "all" },
        { "name": "arrest_count", "label": "Number Arrested", "type": "number", "required": false, "order": 2, "indexable": false, "accessLevel": "all" },
        { "name": "agency", "label": "Arresting Agency", "type": "select", "required": true, "options": ["NYPD", "State Police", "Federal", "Multiple"], "order": 3, "indexable": true, "indexType": "exact", "accessLevel": "all" },
        { "name": "legal_observers_present", "label": "Legal Observers Present", "type": "number", "required": false, "order": 4, "indexable": false, "accessLevel": "all" },
        { "name": "notes", "label": "Notes", "type": "textarea", "required": false, "order": 5, "indexable": false, "accessLevel": "all" }
      ]
    }
  ],

  "reportTypes": [
    {
      "name": "lo_arrest_report",
      "label": "lo_arrest_report.label",
      "labelPlural": "lo_arrest_report.labelPlural",
      "description": "lo_arrest_report.description",
      "icon": "clipboard-list",
      "color": "#f59e0b",
      "category": "report",
      "numberPrefix": "AR",
      "numberingEnabled": true,
      "allowFileAttachments": true,
      "allowCaseConversion": true,
      "mobileOptimized": true,

      "statuses": [
        { "value": "submitted", "label": "status.submitted", "color": "#f59e0b", "order": 1 },
        { "value": "in_review", "label": "status.in_review", "color": "#3b82f6", "order": 2 },
        { "value": "cases_created", "label": "status.cases_created", "color": "#22c55e", "order": 3, "isClosed": true }
      ],
      "defaultStatus": "submitted",
      "closedStatuses": ["cases_created"],

      "fields": [
        { "name": "location", "label": "field.location", "type": "text", "required": true, "order": 1, "accessLevel": "all", "helpText": "Where the arrests happened" },
        { "name": "time", "label": "field.time", "type": "text", "required": true, "order": 2, "accessLevel": "all" },
        { "name": "arresting_agency", "label": "field.arresting_agency", "type": "select", "required": true, "options": ["NYPD", "State Police", "Federal", "ICE/CBP", "Other"], "order": 3, "accessLevel": "all" },
        { "name": "estimated_count", "label": "field.estimated_count", "type": "number", "required": false, "order": 4, "accessLevel": "all", "helpText": "Approximate total arrested" },
        { "name": "arrestee_details", "label": "field.arrestee_details", "type": "textarea", "required": true, "order": 5, "accessLevel": "assigned", "helpText": "List names, physical descriptions, and any details. One person per line. E.g.:\nMaria Garcia - red jacket, Broadway side\nJohn Doe - glasses, needs insulin\nUnknown male - green backpack, beaten by officers" },
        { "name": "general_notes", "label": "field.general_notes", "type": "textarea", "required": false, "order": 6, "accessLevel": "all" }
      ]
    },
    {
      "name": "lo_misconduct_report",
      "label": "lo_misconduct_report.label",
      "labelPlural": "lo_misconduct_report.labelPlural",
      "description": "lo_misconduct_report.description",
      "icon": "shield-alert",
      "color": "#dc2626",
      "category": "report",
      "numberPrefix": "MC",
      "numberingEnabled": true,
      "allowFileAttachments": true,
      "allowCaseConversion": false,
      "mobileOptimized": true,

      "statuses": [
        { "value": "submitted", "label": "status.submitted", "color": "#f59e0b", "order": 1 },
        { "value": "reviewed", "label": "status.reviewed", "color": "#3b82f6", "order": 2 },
        { "value": "evidence_preserved", "label": "status.evidence_preserved", "color": "#22c55e", "order": 3, "isClosed": true }
      ],
      "defaultStatus": "submitted",
      "closedStatuses": ["evidence_preserved"],

      "fields": [
        { "name": "location", "label": "field.location", "type": "text", "required": true, "order": 1, "accessLevel": "all" },
        { "name": "time", "label": "field.time", "type": "text", "required": true, "order": 2, "accessLevel": "all" },
        { "name": "agency", "label": "field.agency", "type": "select", "required": true, "options": ["NYPD", "State Police", "Federal", "ICE/CBP", "Other"], "order": 3, "accessLevel": "all" },
        { "name": "badge_numbers", "label": "field.badge_numbers", "type": "text", "required": false, "order": 4, "accessLevel": "assigned", "helpText": "All badge numbers observed, comma-separated" },
        { "name": "force_type", "label": "field.force_type", "type": "multi-select", "required": false, "options": ["Pepper Spray", "Baton", "Rubber Bullet", "Taser", "Kettle", "Tackle", "Chokehold", "Other"], "order": 5, "accessLevel": "all" },
        { "name": "description", "label": "field.description", "type": "textarea", "required": true, "order": 6, "accessLevel": "assigned", "helpText": "Detailed account: what happened, victim names, officer descriptions, sequence of events" }
      ]
    }
  ],

  "relationshipTypes": [
    {
      "sourceEntityTypeId": "contact",
      "targetEntityTypeId": "arrest_case",
      "cardinality": "M:N",
      "label": "Arrest Cases",
      "reverseLabel": "Contacts",
      "sourceLabel": "has case",
      "targetLabel": "involves",
      "roles": [
        { "value": "arrestee", "label": "Arrestee", "order": 1 },
        { "value": "attorney", "label": "Attorney", "order": 2 },
        { "value": "support_contact", "label": "Support Contact", "order": 3 },
        { "value": "legal_observer", "label": "Legal Observer", "order": 4 }
      ],
      "defaultRole": "arrestee",
      "cascadeDelete": false,
      "required": true
    },
    {
      "sourceEntityTypeId": "arrest_case",
      "targetEntityTypeId": "mass_arrest_event",
      "cardinality": "M:N",
      "label": "Related Events",
      "reverseLabel": "Arrest Cases",
      "sourceLabel": "part of",
      "targetLabel": "includes",
      "cascadeDelete": false,
      "required": false
    },
    {
      "sourceEntityTypeId": "arrest_case",
      "targetEntityTypeId": "lo_arrest_report",
      "cardinality": "M:1",
      "label": "Source Report",
      "reverseLabel": "Cases Created",
      "sourceLabel": "created from",
      "targetLabel": "generated",
      "cascadeDelete": false,
      "required": false
    },
    {
      "sourceEntityTypeId": "lo_misconduct_report",
      "targetEntityTypeId": "arrest_case",
      "cardinality": "M:N",
      "label": "Related Cases",
      "reverseLabel": "Misconduct Reports",
      "sourceLabel": "documents misconduct in",
      "targetLabel": "has misconduct report",
      "cascadeDelete": false,
      "required": false
    },
    {
      "sourceEntityTypeId": "lo_misconduct_report",
      "targetEntityTypeId": "mass_arrest_event",
      "cardinality": "M:N",
      "label": "Related Events",
      "reverseLabel": "Misconduct Reports",
      "sourceLabel": "occurred during",
      "targetLabel": "has misconduct report",
      "cascadeDelete": false,
      "required": false
    }
  ],

  "suggestedRoles": [
    {
      "name": "Hotline Coordinator",
      "slug": "hotline-coordinator",
      "description": "Manages the hotline during actions — full case, event, and report access",
      "permissions": [
        "cases:*", "contacts:*", "events:*", "evidence:*",
        "calls:*", "notes:*", "conversations:*", "reports:*",
        "shifts:read", "volunteers:read", "bans:*"
      ]
    },
    {
      "name": "Intake Volunteer",
      "slug": "intake-volunteer",
      "description": "Takes arrest reports and creates initial case records",
      "permissions": [
        "cases:create", "cases:read-own", "cases:update-own",
        "contacts:create", "contacts:view",
        "calls:answer", "calls:read-active",
        "notes:create", "notes:read-own",
        "events:read", "reports:read-all",
        "shifts:read-own"
      ]
    },
    {
      "name": "Jail Support Coordinator",
      "slug": "jail-support-coordinator",
      "description": "Tracks arraignments, bail, and release. Converts LO field reports into individual cases.",
      "permissions": [
        "cases:create", "cases:read-all", "cases:update", "cases:assign", "cases:close",
        "contacts:create", "contacts:view", "contacts:view-pii", "contacts:edit",
        "events:read", "events:update",
        "evidence:download",
        "notes:read-all", "notes:create",
        "reports:read-all", "reports:update",
        "shifts:read"
      ]
    },
    {
      "name": "Legal Observer",
      "slug": "legal-observer",
      "description": "Submits field reports (arrest lists + misconduct) from mobile. Cannot see cases or PII.",
      "permissions": [
        "reports:create", "reports:read-own", "reports:update-own",
        "events:read",
        "evidence:upload"
      ]
    },
    {
      "name": "Attorney Coordinator",
      "slug": "attorney-coordinator",
      "description": "Matches attorneys with arrestees",
      "permissions": [
        "cases:read-all", "cases:assign", "cases:update",
        "contacts:view", "contacts:view-pii", "contacts:edit",
        "contacts:manage-relationships"
      ]
    }
  ]
}
```

---

## Template #2: Street Medic (abbreviated)

```json
{
  "id": "street-medic",
  "version": "1.0.0",
  "name": "Street Medic",
  "description": "Protest medical encounter tracking with triage, treatment, and follow-up.",
  "tags": ["medical", "protest", "triage"],

  "entityTypes": [
    {
      "name": "medical_encounter",
      "label": "Medical Encounter",
      "labelPlural": "Medical Encounters",
      "icon": "stethoscope",
      "color": "#22c55e",
      "category": "case",
      "numberPrefix": "ME",
      "numberingEnabled": true,

      "statuses": [
        { "value": "triaged", "label": "Triaged", "color": "#f59e0b", "order": 1 },
        { "value": "treating", "label": "Treating", "color": "#3b82f6", "order": 2 },
        { "value": "treated", "label": "Treated", "color": "#22c55e", "order": 3 },
        { "value": "transported", "label": "Transported to Hospital", "color": "#ef4444", "order": 4 },
        { "value": "follow_up", "label": "Follow-Up Needed", "color": "#8b5cf6", "order": 5 },
        { "value": "closed", "label": "Closed", "color": "#6b7280", "order": 6, "isClosed": true }
      ],
      "defaultStatus": "triaged",
      "closedStatuses": ["closed"],

      "severities": [
        { "value": "green", "label": "Green (Minor)", "color": "#22c55e", "icon": "heart", "order": 1 },
        { "value": "yellow", "label": "Yellow (Delayed)", "color": "#f59e0b", "icon": "alert-triangle", "order": 2 },
        { "value": "red", "label": "Red (Immediate)", "color": "#ef4444", "icon": "zap", "order": 3 },
        { "value": "black", "label": "Black (Deceased)", "color": "#000000", "icon": "x-circle", "order": 4 }
      ],
      "defaultSeverity": "green",

      "contactRoles": [
        { "value": "patient", "label": "Patient", "order": 1 },
        { "value": "medic", "label": "Treating Medic", "order": 2 },
        { "value": "witness", "label": "Witness", "order": 3 }
      ],

      "fields": [
        { "name": "chief_complaint", "label": "Chief Complaint", "type": "textarea", "required": true, "section": "assessment", "order": 1, "accessLevel": "assigned" },
        { "name": "mechanism_of_injury", "label": "Mechanism of Injury", "type": "select", "options": ["Tear Gas", "Pepper Spray", "Rubber Bullet", "Baton", "Fall", "Other"], "section": "assessment", "order": 2, "indexable": true, "indexType": "exact", "accessLevel": "all" },
        { "name": "treatment_provided", "label": "Treatment Provided", "type": "textarea", "required": true, "section": "treatment", "order": 3, "accessLevel": "assigned" },
        { "name": "medications", "label": "Medications Administered", "type": "textarea", "section": "treatment", "order": 4, "accessLevel": "admin" },
        { "name": "allergies", "label": "Known Allergies", "type": "text", "section": "patient_info", "order": 5, "accessLevel": "admin" },
        { "name": "disposition", "label": "Disposition", "type": "select", "required": true, "options": ["Treated & Released", "Hospital Transport", "Refused Care", "Left AMA"], "section": "outcome", "order": 6, "indexable": true, "indexType": "exact", "accessLevel": "all" },
        { "name": "hospital_name", "label": "Hospital", "type": "text", "section": "outcome", "order": 7, "accessLevel": "assigned", "showWhen": { "field": "disposition", "operator": "equals", "value": "Hospital Transport" } },
        { "name": "follow_up_needed", "label": "Follow-Up Needed", "type": "checkbox", "section": "outcome", "order": 8, "indexable": true, "indexType": "exact", "accessLevel": "all" },
        { "name": "follow_up_instructions", "label": "Follow-Up Instructions", "type": "textarea", "section": "outcome", "order": 9, "accessLevel": "assigned", "showWhen": { "field": "follow_up_needed", "operator": "equals", "value": true } },
        { "name": "encounter_time", "label": "Time of Encounter", "type": "text", "required": true, "section": "assessment", "order": 10, "accessLevel": "all" }
      ]
    }
  ],

  "suggestedRoles": [
    {
      "name": "Medic Team Lead",
      "slug": "medic-team-lead",
      "description": "Coordinates medical team, reviews all encounters",
      "permissions": ["cases:*", "contacts:*", "events:*", "evidence:*"]
    },
    {
      "name": "Street Medic",
      "slug": "street-medic",
      "description": "Provides care and documents encounters",
      "permissions": ["cases:create", "cases:read-own", "cases:update-own", "contacts:create", "contacts:view", "events:read"]
    }
  ]
}
```

---

## Template Composition Example

A hub running both jail support AND street medics can apply both templates:

```
Hub "Portland Action Support"
  ├── Template: jail-support
  │   ├── Entity: arrest_case
  │   ├── Entity: mass_arrest_event
  │   └── Roles: hotline-coordinator, intake-volunteer, jail-support-coordinator
  │
  └── Template: street-medic
      ├── Entity: medical_encounter
      └── Roles: medic-team-lead, street-medic

  Contact Directory: shared across all entity types
  Events: mass_arrest_event can link to both arrest_cases AND medical_encounters
```

The volunteer assignment determines which entity types they see in the sidebar.
A volunteer with the "street-medic" role sees Medical Encounters; one with
"intake-volunteer" sees Arrest Cases. A hub admin sees everything.

---

## Template Update Flow

When the app ships with a newer version of a template:

```
1. App detects: installed template "jail-support" v1.0.0, available v1.1.0
2. Admin sees notification: "Template update available"
3. Admin opens template diff view showing:
   - New fields added (e.g., "arraignment_time")
   - Changed field labels
   - New status values
   - Removed fields (marked deprecated, not deleted)
4. Admin can:
   a. Accept all changes
   b. Accept selectively (field by field)
   c. Dismiss (keep current version)
5. Applied changes update EntityTypeDefinitions in SettingsDO
6. Existing records are NOT affected (they keep whatever fields they have)
7. New/edited records use the updated field schema
```

### Non-Breaking Template Updates

Templates MUST follow these rules for non-breaking updates:
- **Adding fields**: Always safe (new field appears empty on existing records)
- **Adding enum values**: Always safe (existing values still valid)
- **Renaming labels**: Always safe (display-only change)
- **Removing fields**: Mark as `deprecated: true`, don't delete. Data preserved.
- **Removing enum values**: Mark as `deprecated: true`. Existing records keep the value.
- **Changing field types**: NEVER. Create a new field instead.

---

## Additional Templates (Abbreviated Specs)

### ICE Rapid Response
- Entity: `immigration_case` (category: case)
  - Fields: operation_type, affected_count, immigration_status, detention_facility,
    bond_amount, a_number, family_separation, accompaniment_deployed, kyr_provided
- Entity: `ice_operation` (category: event)
  - Fields: operation_type, agent_count, vehicles, location, duration
- Extends: general-hotline

### DV/IPV Crisis
- Entity: `safety_plan_case` (category: case)
  - Fields: lethality_score, risk_level, shelter_needed, shelter_placed, children_count,
    protection_order_status, weapons_present, strangulation_history, safety_plan_completed
- PII restrictions: extra tight — volunteer-level access very limited

### Bail Fund
- Entity: `bail_fund_case` (category: case)
  - Fields: bail_amount, bond_type, court, docket_number, charges, amount_disbursed,
    court_date, court_appearance_made, bail_returned, bail_return_amount
- Financial tracking fields require admin-only access

### Hate Crime Reporting
- Entity: `bias_incident` (category: case)
  - Fields: incident_type, bias_motivation, target_demographics, location_type,
    perpetrator_count, injuries, property_damage, law_enforcement_filed
- Entity: `incident_cluster` (category: event) — groups related incidents

### Copwatch
- Entity: `police_conduct_case` (category: case)
  - Fields: badge_numbers, officer_names, department, incident_type, force_type,
    complaint_filed, ccrb_referral, civil_lawsuit, evidence_count
- Evidence management critical — chain of custody

### Tenant Organizing
- Entity: `eviction_defense_case` (category: case)
  - Fields: unit_number, landlord, eviction_type, court_date, index_number,
    attorney_status, rent_amount, arrears, housing_violations, hp_action, rent_stabilized
- Supports parent/child cases (building → units)

### Mutual Aid
- Entity: `aid_request` (category: case)
  - Fields: need_category, urgency, people_count, elderly, children, disabled,
    medical_equipment, pets, access_issues, resources_delivered
- Fast intake, high volume, simple workflow

### Missing Persons
- Entity: `missing_person_case` (category: case)
  - Fields: last_known_location, last_contact_date, physical_description, travel_route,
    detention_check, facilities_checked, dna_sample, namus_id, media_authorized
- Long-running cases (months/years)

### General Hotline
- Entity: `general_case` (category: case)
  - Fields: category (configurable dropdown), notes, follow_up_needed, resolution
- Minimal template — good starting point for custom configurations
- Other templates extend this
