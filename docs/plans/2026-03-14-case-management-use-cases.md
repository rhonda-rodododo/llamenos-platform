# Case Management System — Use Case Catalog

**Date**: 2026-03-14
**Status**: DRAFT — evolving as research completes
**Purpose**: Document all organization types that would use Llamenos case management, their specific workflows, entity types, and how the system would be configured for each. Drives the template system design.

---

## How to Read This Document

Each use case describes:
- **Who**: The type of organization
- **Scenario**: A concrete operational scenario
- **Entities**: What contacts, cases, events, and reports they track
- **Roles**: Who does what
- **Key fields**: Domain-specific custom fields
- **Workflow**: How cases move through statuses
- **Template name**: What the pre-built template would be called
- **Cross-hub**: How this hub type interacts with others

---

## 1. NLG Legal Observer Hotline

**Who**: National Lawyers Guild legal observer programs at protests and direct actions.

**Scenario**: It's a large march. 20 NLG legal observers are deployed wearing green hats. A mass arrest occurs — 47 people are kettled and arrested.

**Two report types flow in from the field:**

1. **Arrest Reports** — LOs submit a single report listing multiple arrestee names (not one form per person). LOs in the field don't have time for individual intake forms. A single report might say: "Mass arrest at Broadway & 4th, ~15 people. Names: [list]. Photos attached." This report may include photos and video evidence. Later, jail support volunteers on the desktop app break each name out into an individual arrest case — typically when the arrestee calls from jail, or when a support contact reaches out to confirm. Support contacts may also call in asking "was [name] arrested?" — the LO report is the reference for confirming.

2. **Police Misconduct Reports** — LOs document police abuse, excessive force, badge numbers, use of weapons, kettling tactics, etc. These reports are filed for use in lawsuits and are linked to cases and events as evidence. They may include photos and video.

Both report types are submitted from mobile devices (iOS/Android) in the field.

**Entities**:
- **Contacts**: Arrestees, legal observers, attorneys, support contacts
- **Cases**: One case per arrestee — created from LO arrest reports by jail support volunteers, OR directly when an arrestee calls from jail
- **Events**: The protest/march itself, the mass arrest event (child of the protest)
- **Reports**: Two template-defined report types:
  - `lo_arrest_report` — batch report with repeating "arrestee" rows (name, description, location), plus media attachments. LO submits one report covering many arrests.
  - `lo_misconduct_report` — police abuse documentation with badge numbers, force descriptions, media evidence. Used for lawsuits.

**Key Workflow: Report → Cases Conversion** (powered by generic report triage — see Epic 342):

This workflow is not built into the app. It emerges from the jail-support template's configuration: `lo_arrest_report` has `allowCaseConversion: true`, so the generic report triage queue shows these reports. The case creation form is rendered from the `arrest_case` entity type definition. The LLM parsing prompt (if used) is generated from the same entity type fields. A street medic hub would have a completely different triage workflow driven by its own template.

```
1. Field volunteer submits a report (template-defined report type with allowCaseConversion: true)
2. Report appears in the generic "Incoming Reports" triage queue on desktop
3. Coordinator reviews report, sees freeform text with names/details
4. For each person mentioned:
   a. Person calls in → coordinator creates case from triage view, auto-links to report
   b. Support contact calls about person → same flow
   c. Coordinator proactively creates case from report → status uses template default
5. Each created case links back to the source report via ReportCaseLink
6. Report tracks conversion progress (how many cases created)
7. Optional: LLM parses freeform text into suggested case entries (prompt from template fields)
```

**Roles**:
| Role | Description | Permissions |
|------|------------|-------------|
| Hotline Coordinator | Manages the hotline during actions | cases:*, events:*, contacts:*, reports:* |
| Intake Volunteer | Answers calls, creates arrest records | cases:create, contacts:create, cases:read-own |
| Jail Support Coordinator | Tracks arraignments, bail, release; converts LO reports into cases | cases:*, contacts:view-pii, reports:read-all |
| Legal Observer | Submits field reports (arrests + misconduct) from mobile | reports:create, reports:read-own, events:read, evidence:upload |
| Attorney Coordinator | Matches attorneys with arrestees | cases:assign, cases:read-all, contacts:view-pii |

**Report Type: "LO Arrest Report"** (template-defined, mobile-optimized):

LOs in the field need to submit fast. The primary input is a **single freeform text field** where the LO lists names, descriptions, and details however they naturally would. No structured forms per person — speed is everything. Jail support volunteers on desktop parse this later when creating individual cases.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Location | text | yes | Where arrests occurred |
| Time | text | yes | When arrests occurred |
| Arresting Agency | select | yes | NYPD, State Police, Federal, Other |
| Estimated Arrest Count | number | no | Approximate total if names unknown |
| Arrestee Details | textarea | yes | **Freeform text** — LO lists names, descriptions, details in whatever format is fastest. Example: "Maria Garcia - red jacket, taken from Broadway side / John Doe - glasses, medical needs (insulin) / Unknown male - green backpack, resisted, beaten by officers" |
| General Notes | textarea | no | Overall observations about the arrest scene |
| Media | file-attachments | no | Photos and video from the scene |

**Report Type: "LO Misconduct Report"** (template-defined, mobile-optimized):

Also freeform-first for field speed. Evidence attachments are the most important part — detailed descriptions can be added or refined later.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Location | text | yes | Where misconduct occurred |
| Time | text | yes | When it occurred |
| Agency | select | yes | Which agency |
| Badge Numbers | text | no | All badge numbers observed (freeform, e.g. "4521, 8903, unknown third") |
| Force Type | multi-select | no | Pepper spray, baton, rubber bullet, taser, kettle, tackle, other |
| Description | textarea | yes | Detailed account of what happened — names of victims, officer descriptions, sequence of events |
| Media | file-attachments | no | Photos and video evidence — **critical for lawsuits**. This is the primary evidentiary value of these reports |

**Case Type: "Arrest / Jail Support"**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Arrest Location | text | yes | Where arrested |
| Arrest Time | text | yes | When arrested |
| Arresting Agency | select | yes | Options: NYPD, State Police, Federal, Other |
| Precinct/Station | text | no | Where taken for processing |
| Booking Number | text | no | Assigned during processing |
| Charges | textarea | no | Initial charges, updated as known |
| Bail Amount | number | no | |
| Bail Status | select | no | Held, Posted, ROR, No Bail Set |
| Court Date | text | no | |
| Courtroom | text | no | |
| Attorney Status | select | yes | Needs Attorney, Has Attorney, Declined, Unknown |
| Attorney Name | text | no | |
| Medical Needs | checkbox | no | Does the person have medical needs? |
| Medical Details | textarea | no | Medication, conditions, injuries |
| Release Status | select | yes | In Custody, Released, Transferred, Unknown |
| Release Time | text | no | |
| Physical Description | textarea | no | For identification when name unknown |
| Property Seized | textarea | no | Phone, ID, belongings taken |
| Source Report | report-link | no | Links back to the LO arrest report this case was created from |

**Statuses**: `reported` → `confirmed` → `in_custody` → `arraigned` → `released` → `case_closed`
**Severities**: `urgent` (medical need, minor, vulnerable person), `standard`, `low` (already has attorney)

**Event Type: "Mass Arrest"**:
- Location, time, number of arrests, arresting agency, legal observer count deployed
- Links to all arrest cases from this event
- Links to all LO reports from this event

**Cross-hub**: An NLG hub might share case summary data with a bail fund hub (which cases need bail posted) and a street medic hub (which arrestees reported medical needs).

---

## 2. ICE Rapid Response Network

**Who**: Immigrant rights organizations that coordinate rapid response when ICE conducts raids or enforcement operations.

**Scenario**: A community member calls the hotline to report seeing ICE agents at a specific apartment building. The network activates — accompaniment teams are dispatched, community alerts go out, and affected families are connected with legal resources. Over the next 48 hours, 5 families are affected, needing legal representation, know-your-rights information, and emergency housing.

**Entities**:
- **Contacts**: Affected individuals/families, community reporters, attorneys, accompaniment volunteers
- **Cases**: One per affected individual/family — tracks their legal status and needs
- **Events**: The ICE operation itself (location, duration, scope)
- **Reports**: ICE sighting reports from community members (may become evidence)

**Roles**:
| Role | Description |
|------|------------|
| Dispatch Coordinator | Receives reports, activates response |
| Accompaniment Volunteer | Deploys to location, provides presence |
| Legal Intake | Connects affected people with attorneys |
| Case Manager | Long-term case tracking (bond, court dates) |
| Community Alert Manager | Sends blast alerts to community |

**Case Type: "Immigration Enforcement Response"**:
| Field | Type | Required |
|-------|------|----------|
| ICE Operation Type | select | yes | (Raid, Traffic Stop, Courthouse, Workplace, Home Visit) |
| Number of Agents | number | no |
| Vehicles | text | no | (descriptions for evidence) |
| Affected Individuals | number | yes |
| Immigration Status | select | no | (Undocumented, DACA, TPS, Asylum Pending, Unknown) |
| Detention Facility | select | no | (local facilities list) |
| Bond Amount | number | no |
| Court Date | text | no |
| Attorney Status | select | yes |
| A-Number | text | no | (alien registration number) |
| Family Separation | checkbox | no |
| Children Affected | number | no |
| Emergency Housing Needed | checkbox | no |
| Know Your Rights Provided | checkbox | yes |
| Accompaniment Deployed | checkbox | yes |

**Statuses**: `reported` → `response_active` → `stabilized` → `legal_referral` → `ongoing_support` → `resolved`

**Event Type: "ICE Operation"**:
- Location (approximate — security sensitive!), date, duration, scope
- Number of agents, vehicles, tactics used
- Response actions taken

**Cross-hub**: ICE response hubs need tight integration with legal aid hubs for attorney matching and immigration court tracking.

---

## 3. Bail Fund

**Who**: Community bail funds that post bail for people who can't afford it.

**Scenario**: After a mass arrest at a protest, the jail support hotline has identified 12 people who need bail posted. The bail fund coordinator receives the list, reviews each case for eligibility, arranges bail posting, and tracks disbursements and court date compliance.

**Entities**:
- **Contacts**: Defendants, co-signers, attorneys
- **Cases**: One per defendant — tracks bail status and fund disbursement
- **Events**: The mass arrest event (shared with NLG hub)

**Roles**:
| Role | Description |
|------|------------|
| Fund Coordinator | Approves bail disbursements |
| Bail Poster | Physically goes to court/jail to post bail |
| Court Monitor | Tracks court dates and appearances |
| Finance Admin | Manages fund accounting |

**Case Type: "Bail Fund Case"**:
| Field | Type | Required |
|-------|------|----------|
| Bail Amount | number | yes |
| Bond Type | select | yes | (Cash, Surety, Property, ROR) |
| Court | text | yes |
| Case/Docket Number | text | no |
| Charges | textarea | yes |
| Bail Posted Date | text | no |
| Bail Posted By | text | no |
| Amount Disbursed | number | no |
| Court Date | text | yes |
| Court Appearance Made | checkbox | no |
| Bail Returned | checkbox | no |
| Bail Return Amount | number | no |
| Co-Signer Name | text | no |
| Eligibility Notes | textarea | no |

**Statuses**: `pending_review` → `approved` → `bail_posted` → `released` → `court_monitoring` → `bail_returned` | `bail_forfeited`

---

## 4. Domestic Violence / IPV Crisis Hotline

**Who**: DV crisis hotlines that provide safety planning, referrals, and emergency shelter.

**Scenario**: A caller reaches the hotline in crisis — their partner has become violent and they need to leave. The advocate conducts a lethality assessment, develops a safety plan, arranges emergency shelter, and opens a case for ongoing support. The caller has children who also need services.

**Entities**:
- **Contacts**: Survivor, children/dependents, perpetrator (limited info), service providers
- **Cases**: Safety plan case, shelter case, legal protection case (restraining order)
- **Reports**: Not typically used (callers are not "reporters" — they are clients)

**CRITICAL: Extra security requirements**:
- Perpetrator contact info must NEVER be accessible to volunteers — admin-only PII
- Address Confidentiality Program (ACP) compliance
- No location tracking whatsoever
- Audit trail critical — court-admissible documentation

**Roles**:
| Role | Description |
|------|------------|
| Crisis Advocate | Answers calls, conducts assessments |
| Shelter Coordinator | Manages shelter placement |
| Legal Advocate | Assists with protection orders |
| Case Manager | Long-term safety planning |
| Supervisor | Reviews high-lethality cases |

**Case Type: "DV/IPV Safety Plan"**:
| Field | Type | Required |
|-------|------|----------|
| Lethality Score | number | yes | (0-20 based on validated instrument) |
| Risk Level | select | yes | (Low, Medium, High, Extreme) |
| Shelter Needed | checkbox | yes |
| Shelter Placed | checkbox | no |
| Children Count | number | no |
| Children Ages | text | no |
| Protection Order Status | select | no | (None, Filed, Granted, Expired) |
| Protection Order Number | text | no |
| Safety Plan Completed | checkbox | yes |
| Weapons Present | checkbox | yes |
| Prior DV Reports | checkbox | no |
| Substance Abuse Factor | checkbox | no |
| Strangulation History | checkbox | no | (key lethality indicator) |
| Emergency Contact Notified | checkbox | no |
| Referrals Made | textarea | no |

**Statuses**: `intake` → `active_crisis` → `safety_planned` → `sheltered` | `community_plan` → `follow_up` → `closed`

---

## 5. Street Medic / Protest Medical

**Who**: Volunteer street medic teams providing first aid at protests and actions.

**Scenario**: During a protest, police deploy tear gas. The medic team treats 15 people for chemical exposure, 3 for rubber bullet injuries, and 1 for a fracture. Each patient gets a brief encounter record. The medic coordinator tracks follow-ups for serious injuries.

**Entities**:
- **Contacts**: Patients (often anonymous — physical description only)
- **Cases**: One per patient encounter
- **Events**: The protest/action where medical care was provided

**Roles**:
| Role | Description |
|------|------------|
| Medic Team Lead | Coordinates team, reviews encounters |
| Street Medic | Provides care, documents encounters |
| Follow-Up Coordinator | Tracks patients needing hospital/clinic care |

**Case Type: "Medical Encounter"**:
| Field | Type | Required |
|-------|------|----------|
| Triage Level | select | yes | (Green/Minor, Yellow/Delayed, Red/Immediate, Black) |
| Chief Complaint | textarea | yes |
| Mechanism of Injury | select | no | (Tear Gas, Pepper Spray, Rubber Bullet, Baton, Fall, Other) |
| Treatment Provided | textarea | yes |
| Medications Administered | textarea | no |
| Allergies | text | no |
| Disposition | select | yes | (Treated & Released, Hospital Transport, Refused Care, Left AMA) |
| Hospital Name | text | no | (if transported) |
| Follow-Up Needed | checkbox | no |
| Follow-Up Instructions | textarea | no |
| Patient Identifier | text | no | (wristband ID, physical description) |
| Time of Encounter | text | yes |

**Statuses**: `triaged` → `treating` → `treated` → `follow_up` | `transported` → `closed`
**Severities**: `green` (minor), `yellow` (delayed), `red` (immediate), `black` (deceased/expectant)

---

## 6. Anti-Trafficking Hotline

**Who**: Organizations that receive tips about human trafficking and coordinate survivor services.

**Scenario**: A caller reports suspicious activity at a business — workers who appear to be living on premises, restricted from leaving. The intake specialist creates a tip record, assesses credibility, and coordinates with law enforcement and survivor services organizations.

**Entities**:
- **Contacts**: Tipster, potential victims, suspects (minimal info), service providers, law enforcement contacts
- **Cases**: Complex — may involve multiple victims, locations, and suspects
- **Reports**: Tips from community members

**Case Type: "Trafficking Investigation/Survivor Services"**:
| Field | Type | Required |
|-------|------|----------|
| Trafficking Type | select | yes | (Labor, Sex, Domestic Servitude, Other) |
| Number of Potential Victims | number | no |
| Location Type | select | no | (Business, Residence, Farm, Factory, Other) |
| Law Enforcement Referral Made | checkbox | no |
| Agency Referred To | text | no |
| FBI Case Number | text | no |
| Survivor Services Needed | textarea | no | (housing, medical, legal, mental health) |
| Services Connected | textarea | no |
| Immigration Relief Available | select | no | (T-Visa, U-Visa, SIJS, None, Unknown) |
| Country of Origin | text | no |
| Language Needs | text | no |
| Minor Involved | checkbox | yes |

**Statuses**: `tip_received` → `under_investigation` → `services_coordinated` → `survivor_safe` → `case_closed`

---

## 7. Hate Crime / Bias Incident Reporting

**Who**: Organizations like Stop AAPI Hate, ADL, SPLC that collect and analyze hate crime reports.

**Scenario**: Community members report incidents via the hotline or web form. Reports include verbal harassment, physical assault, vandalism, and online threats. The organization categorizes incidents, provides victim support referrals, and compiles data for advocacy reports.

**Entities**:
- **Contacts**: Victims, witnesses, perpetrators (if identified)
- **Cases**: One per incident (or per victim per incident)
- **Events**: Clustered incidents may link to events (e.g., pattern of harassment in a neighborhood)
- **Reports**: Incident reports from victims/witnesses

**Case Type: "Hate Crime / Bias Incident"**:
| Field | Type | Required |
|-------|------|----------|
| Incident Type | select | yes | (Physical Assault, Verbal Harassment, Vandalism, Intimidation, Online, Arson, Other) |
| Bias Motivation | select | yes | (Race, Religion, Sexual Orientation, Gender Identity, Disability, Immigration Status, Other) |
| Target Demographics | select | no | (community targeted) |
| Location Type | select | no | (Street, Home, School, Workplace, Transit, Online) |
| Number of Perpetrators | number | no |
| Perpetrator Identified | checkbox | no |
| Law Enforcement Report Filed | checkbox | no |
| Report Number | text | no |
| Injuries | select | no | (None, Minor, Moderate, Severe, Fatal) |
| Property Damage | checkbox | no |
| Victim Services Offered | checkbox | yes |
| Media Coverage | checkbox | no |

**Statuses**: `reported` → `verified` → `support_offered` → `law_enforcement_referred` | `advocacy_included` → `closed`

---

## 8. Police Accountability / Copwatch

**Who**: Copwatch organizations that document police conduct and support accountability.

**Scenario**: A Copwatch volunteer witnesses police using excessive force during a traffic stop. They document the incident, noting badge numbers, vehicle numbers, and recording video. The documentation is filed with the organization and may be used in a complaint or civil rights lawsuit.

**Entities**:
- **Contacts**: Subjects (people police interacted with), officers (badge numbers), witnesses
- **Cases**: One per accountability investigation
- **Reports**: Field observation reports with evidence

**Case Type: "Police Accountability"**:
| Field | Type | Required |
|-------|------|----------|
| Officer Badge Numbers | textarea | yes | (one per line) |
| Officer Names | textarea | no |
| Department | select | yes |
| Incident Type | select | yes | (Use of Force, Unlawful Search, Racial Profiling, False Arrest, Other) |
| Force Type Used | select | no | (Hands, Baton, Taser, OC Spray, Rubber Bullets, Firearm, K9, Other) |
| Complaint Filed | checkbox | no |
| Complaint Number | text | no |
| CCRB/IAB Referral | checkbox | no |
| Civil Lawsuit Filed | checkbox | no |
| Evidence Count | number | no |
| Video Evidence | checkbox | no |
| Body Cam Requested | checkbox | no |
| FOIL/FOIA Filed | checkbox | no |

**Statuses**: `documented` → `evidence_gathered` → `complaint_filed` → `under_review` → `resolved` | `litigation`

**Evidence management**: Critical — chain of custody for videos, photos, audio recordings.

---

## 9. Tenant Organizing / Eviction Defense

**Who**: Tenant unions and housing rights organizations that organize tenants and fight evictions.

**Scenario**: A building with 30 units is facing mass eviction by a corporate landlord. The tenant union organizes tenants, documents housing code violations, coordinates legal defense, and tracks each unit's case through housing court.

**Entities**:
- **Contacts**: Tenants, landlord/property management, attorneys, housing inspectors
- **Cases**: One per tenant/unit, possibly grouped under a building-level parent case
- **Events**: Court dates, inspections, rallies, hearings

**Case Type: "Eviction Defense"**:
| Field | Type | Required |
|-------|------|----------|
| Building Address | text | yes | (encrypted — address privacy matters) |
| Unit Number | text | yes |
| Landlord/Management Company | text | yes |
| Eviction Type | select | yes | (Nonpayment, Holdover, Owner Occupancy, Nuisance, Other) |
| Court Date | text | no |
| Court | text | no |
| Case/Index Number | text | no |
| Attorney Status | select | yes |
| Rent Amount | number | no |
| Arrears Amount | number | no |
| Housing Violations Documented | number | no |
| HP Action Filed | checkbox | no |
| Tenant Association Member | checkbox | no |
| Lease Expires | text | no |
| Rent Stabilized | checkbox | no |
| Section 8 | checkbox | no |
| Household Size | number | no |
| Children Present | checkbox | no |

**Statuses**: `intake` → `organizing` → `legal_representation` → `in_court` → `settled` | `evicted` | `dismissed`

**Building-level grouping**: Parent case for the building, child cases for each unit/tenant.

---

## 10. Disaster Response / Mutual Aid

**Who**: Mutual aid networks that coordinate resource distribution during disasters.

**Scenario**: A hurricane hits. The mutual aid network receives hundreds of calls — people need water, medicine, evacuations, generator fuel. Volunteers are dispatched, resources tracked, and needs matched with available supplies.

**Entities**:
- **Contacts**: People in need, volunteers, resource donors
- **Cases**: One per household/need — tracks fulfillment
- **Events**: The disaster (parent), daily response operations (sub-events)

**Case Type: "Mutual Aid Request"**:
| Field | Type | Required |
|-------|------|----------|
| Need Category | select | yes | (Water, Food, Medical, Shelter, Transport, Power, Other) |
| Urgency | select | yes | (Immediate, Within 24h, Within 48h, Ongoing) |
| Number of People | number | yes |
| Elderly Present | checkbox | no |
| Children Present | checkbox | no |
| Disabled/Mobility Issues | checkbox | no |
| Medical Equipment Needed | checkbox | no |
| Pets | checkbox | no |
| Access Issues | textarea | no | (flooded road, no power, etc.) |
| Resources Delivered | textarea | no |
| Delivery Date | text | no |
| Follow-Up Needed | checkbox | no |
| Volunteer Assigned | text | no |

**Statuses**: `requested` → `volunteer_assigned` → `in_transit` → `delivered` → `follow_up` → `resolved`

---

## 11. Missing Persons / Disappearances

**Who**: Organizations tracking disappeared people, especially in Latin America, at borders, or during conflict.

**Scenario**: A family contacts the hotline because their relative crossed the US-Mexico border 2 weeks ago and has not been heard from. The organization creates a case, contacts detention facilities, checks morgue records, and coordinates with consulates and other search organizations.

**Entities**:
- **Contacts**: Missing person, family members, last known contacts, search volunteers
- **Cases**: One per missing person — may span months or years
- **Events**: Last known sighting, search operations

**Case Type: "Missing Person"**:
| Field | Type | Required |
|-------|------|----------|
| Last Known Location | text | yes |
| Last Contact Date | text | yes |
| Physical Description | textarea | yes |
| Age | number | no |
| Nationality | text | no |
| Travel Route | textarea | no | (for border crossings) |
| Detention Check | select | no | (Not Checked, Checked - Not Found, Checked - Found, N/A) |
| Facilities Checked | textarea | no |
| Consulate Contacted | checkbox | no |
| DNA Sample Available | checkbox | no |
| NamUs ID | text | no | (National Missing and Unidentified Persons System) |
| Red Cross Referral | checkbox | no |
| Family Contact Frequency | select | no | (Daily, Weekly, As Needed) |
| Media Release Authorized | checkbox | no |
| Photo Available | checkbox | no |

**Statuses**: `reported_missing` → `active_search` → `located_alive` | `located_deceased` | `unresolved`

---

## 12. Know Your Rights / Community Education

**Who**: Organizations that deploy KYR trainers and track community education efforts.

**Scenario**: An organization runs 50 KYR trainings per month across a metro area. They track which communities have been reached, trainer deployment, materials distributed, and follow-up requests for legal assistance.

**Entities**:
- **Contacts**: Trainers, community partners, attendees (if tracked)
- **Cases**: Not typically cases — more like event tracking with attendance
- **Events**: Each training session

**Event Type: "Community Training"**:
- Location, date, trainer(s), attendance count, materials distributed
- Language(s), community served, follow-up requests generated

This is primarily an event-tracking use case, not case management. But events from trainings may link to later cases (someone who attended a KYR training later calls the hotline after being stopped by ICE).

---

## Template System Design

### Template Structure

A template is a JSON configuration package that bootstraps a hub with:
- Case type definitions (statuses, fields, contact roles)
- Event type definitions
- Report type definitions
- Suggested roles with permissions
- i18n labels for all custom fields and enum values

### Template Format

```typescript
interface CaseManagementTemplate {
  id: string                        // e.g., "nlg-legal-observer"
  version: string                   // semver
  name: string                      // "NLG Legal Observer"
  description: string
  author: string
  license: string                   // "CC-BY-SA-4.0"

  // i18n
  labels: Record<string, Record<string, string>>  // { "en": { "key": "value" }, "es": { ... } }

  // Configuration payloads
  caseTypes: Omit<CaseType, 'id' | 'hubId' | 'createdAt' | 'updatedAt'>[]
  eventTypes: Omit<EventType, 'id' | 'hubId' | 'createdAt' | 'updatedAt'>[]
  reportTypes?: Omit<ReportType, 'id' | 'createdAt' | 'updatedAt'>[]
  suggestedRoles?: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[]

  // Composability
  extends?: string[]                // Template IDs this extends
  tags: string[]                    // ["legal", "protest", "jail-support"]
}
```

### Pre-Built Templates (ship with app)

| Template ID | Name | Primary Use Case |
|------------|------|-----------------|
| `nlg-legal-observer` | NLG Legal Observer | Protest legal observation, mass arrest tracking |
| `jail-support` | Jail Support | Arrest intake, arraignment tracking, release coordination |
| `bail-fund` | Bail Fund | Bail disbursement, court monitoring, fund accounting |
| `ice-rapid-response` | ICE Rapid Response | ICE raid response, immigration case tracking |
| `street-medic` | Street Medic | Protest medical encounters, triage, follow-up |
| `dv-crisis` | DV/IPV Crisis | Safety planning, shelter placement, protection orders |
| `anti-trafficking` | Anti-Trafficking | Trafficking tips, survivor services, law enforcement coordination |
| `hate-crime-reporting` | Hate Crime Reporting | Bias incident documentation, victim support |
| `copwatch` | Police Accountability | Police conduct documentation, complaint tracking |
| `tenant-organizing` | Tenant Organizing | Eviction defense, building organizing, housing court |
| `mutual-aid` | Mutual Aid | Disaster response, resource distribution |
| `missing-persons` | Missing Persons | Disappearance tracking, search coordination |
| `general-hotline` | General Hotline | Basic hotline case tracking (calls, notes, contacts) |

### Template Composition

Templates can extend each other. Common patterns:
- `jail-support` extends `nlg-legal-observer` (adds bail, court fields)
- `ice-rapid-response` extends `general-hotline` (adds immigration-specific fields)
- Organizations can apply multiple templates and get the union of all case types

### Template Application Flow

1. Admin enables case management in hub settings
2. Admin browses template catalog (or skips to create custom)
3. Selected templates are applied → case types, event types, roles created
4. Admin can modify any imported configuration
5. Template source is recorded for potential future updates

### Template Versioning

- Templates ship with the app as JSON in `packages/protocol/templates/`
- Templates are versioned (semver)
- When a template is updated, admins are notified and can choose to merge changes
- Custom modifications are preserved during template updates (3-way merge: old template, new template, current config)

---

## Cross-Hub Interaction Patterns

### Pattern 1: Arrest → Jail Support → Bail Fund → Legal

1. NLG hub creates arrest case during mass arrest event
2. NLG hub shares case summary with Bail Fund hub (opt-in)
3. Bail Fund hub creates linked bail fund case for the same contact
4. Both hubs share attorney status updates
5. Contact has two cases (one per hub) linked to the same event

### Pattern 2: ICE Report → Legal Referral

1. ICE Rapid Response hub receives sighting report
2. Report is linked to an event (the ICE operation)
3. Affected individuals become contacts with immigration cases
4. Cases are shared with a legal aid hub for attorney matching
5. The legal aid hub creates their own case for each individual

### Pattern 3: Street Medic → Hospital Follow-Up

1. Street medic hub documents medical encounter at protest
2. Patient with serious injury is transported to hospital
3. Case is shared with jail support hub (if patient was also arrested)
4. Follow-up coordinator contacts patient for check-in

### Pattern 4: Community Reports → Case Creation

1. Reporter submits ICE sighting report via public portal
2. Report is reviewed by rapid response coordinator
3. If credible, an event is created and cases opened for affected people
4. The report is linked to the event and relevant cases

---

## Scale Estimates by Use Case

| Use Case | Contacts/Hub | Active Cases/Hub | Peak Cases (event) | Events/Year |
|----------|-------------|-----------------|-------------------|-------------|
| NLG Legal Observer | 500-5000 | 50-200 | 500+ (mass arrest) | 50-200 |
| ICE Rapid Response | 200-2000 | 20-100 | 50 (large raid) | 20-100 |
| Bail Fund | 100-500 | 20-100 | 100+ (mass arrest) | 10-50 |
| DV Crisis | 500-5000 | 50-200 | N/A (steady flow) | N/A |
| Street Medic | 200-1000 | 10-50 | 100+ (mass event) | 20-50 |
| Anti-Trafficking | 100-500 | 10-50 | N/A | N/A |
| Hate Crime | 200-2000 | 20-100 | N/A (steady flow) | N/A |
| Copwatch | 100-500 | 10-50 | N/A | N/A |
| Tenant Organizing | 200-2000 | 50-200 | 100+ (building) | N/A |
| Mutual Aid | 500-5000 | 50-500 | 1000+ (disaster) | 1-5 |
| Missing Persons | 100-1000 | 20-200 | N/A | N/A |

**Design target**: Support 1000+ active cases per hub with responsive UI (< 2s page load for case list with filters).
