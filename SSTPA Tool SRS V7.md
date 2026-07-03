SSTPA Tool - Software Requirements Specification (SRS) Version: 0.7 Date: July 4, 2026.
Permission is granted to collaborators and contractors working under authorization from Nicholas Triska to use, reproduce, and modify this document for the purpose of developing the SSTPA Tool and its derivatives.
Any distribution or reuse outside this scope requires prior written consent.

# 1.  Introduction

## 1.1  SRS Definitions

Purpose This Software Requirements Specification (SRS) defines the complete functional and non-functional requirements for the Systems Security-Theoretic Process Analysis (SSTPA) Tool version. This document is intended to be the single source of truth for all project stakeholders, including developers, testers, and project managers. It describes the system's features, capabilities, operational environment, and constraints, ensuring a common understanding and guiding the design, implementation, and verification of the software.

The imperative terminology used in this SRS is standard, but defined here for clarity.

* Statements are line-items or groups of line items (e.g. this list).  Statements are requirements when they contain an imperative listed below.
* "SHALL" used in a statement indicates its implementation is mandatory and its correct behavior must be tested.
* "Should" used in a statement indicates it is treated as "SHALL" unless justification is provided and permission granted to omit or defer this requirement.
* "Will" used in a statement indicates an expected behavior which occurs as the result of other requirements and therefore needs no special action.  Where a "Will" statement is likely not to occur, notification and explanation must be given.
* "May" used in a statement indicates the requirement is optional.  If employed, it is treated as a "SHALL" but no justification is needed for omitting it.
* Statements without an imperative are either background information informing design, definitions or headings used for organization.

This SRS tries to describe components as they are to be implemented, specifically as individual node instances from a graph database which forces description of components to be singular.  In most cases, the correct interpretation is the plural.  For example the statement:  "(:Requirement) specifies (:Countermeasure)" is to be interpreted as one or many (:Requirement) components specifies one or many (:Countermeasure) components.

SysML 2.0 — OMG Systems Modeling Language version 2.0 (Part 1: Language
Specification). KerML 1.0 — OMG Kernel Modeling Language version 1.0. SysML 2.0
is constructed as an extension of KerML 1.0; every SysML element is a KerML
element. "Model text" in this SRS means the standard textual notations defined
in SysML 2.0 Clause 8.2.2 and KerML 1.0 Clause 8.2.2.

G2M — the Graph-to-Model translator (Neo4j Core Data Model to SysML 2.0/KerML
1.0 textual notation), specified in Section 3.7.

M2G — the Model-to-Graph translator (SysML 2.0/KerML 1.0 textual notation to
staged Core Data Model mutations), specified in Section 3.7.

SSTPA Profile Library — the KerML 1.0 library package shipped with SSTPA Tools
defining all SSTPA domain concepts not native to SysML 2.0, specified in
Section 3.7.3.

Engineering Translation Set — the subset of Backend data subject to
translation, specified in Section 3.7.2.


## 1.2 Overview of SSTPA

Systems Security Theoretic Process Analysis (SSTPA) is a systems security engineering methodology derived from Systems Theoretic Process Analysis (STPA) by Nicholas Triska in 2025.  STPA (System-Theoretic Process Analysis) is a relatively new hazard analysis technique based on an extended model of accident causation. In addition to component failures, STPA assumes that accidents can also be caused by unsafe interactions of system components (elements), none of which may have failed. STPA was developed by Nancy Leveson at MIT where it continues to evolve.

Simplistically, SSTPA extends STPA by introducing the concept of (:Asset), Criticality and the Security Attributes (Confidentiality, Integrity, Availability, Authenticity, Non-Repudiation, Certifiable, and Trustworthy) to make theoretic process analysis useful for System Security.  STPA focuses on Safety where the core idea is that a (:Loss) may be caused by a (:Hazard).  STPA implies one Criticality, Safety.  SSTPA is (:Asset) centric; (:Loss) occurs when the Security Assurance on an (:Asset) is compromised and conditions where this may occur are (:Hazard). (:Hazard) conditions should be isolated by (:State) and mitigated by (:Countermeasure) realized through (:Requirement).

Criticality is a regime.  Pragmatically, a regime is an environment with decision makers, shared values, and accepted rules/processes.  The Safety Critical regime is similar to the Flight Critical regime but very different from the system security regimes which include Mission, Cyber-Security, Anti-Tamper, Software/Hardware Assurance, Export Control, Privacy, Surety, and others.  Each regime is mediated by experts who interact with regime decision makers to navigate regime specific certification / approval.   The SSTPA methodology is intended for use by those regime experts to realize systems that satisfy regime goals, show due diligence and speed the certification or approval process.

SSTPA extends the theoretic process analysis with rigorous systems engineering methodology.  STPA develops (:SecurityControl) which "must" be integrated for the system to be acceptable.  SSTPA maps (:Countermeasure) which satisfies the (:SecurityControl) and is specified by (:Requirement) verified by (:Verification).  The (:Requirement) how organizations realize engineered systems.  Further, SSTPA associates (:Validation) to (:System) assuring the realized system faithfully executes the (:System) (:Purpose).

The SSTPA methodology mitigates the complexity around system security analysis and design in large real-world engineered systems.  These are developed top-down in a stepwise formal gated process rather than "all at once".  The SSTPA Methodology accompanies the traditional engineering process and combats complexity by focusing analysis and development of requirements at the level of a System of Interest (SoI).  This approach enhances the System Specification tree by providing (as output) system security requirements for each leaf and branch on the specification tree.



## 1.2.1 Overview of SSTPA Tools

SSTPA Tools is intended to scale the SSTPA Methodology to the largest, most complex real-world systems.  To achieve this it will include an ACID graph database backend capable of meeting the system security needs of a large and dispersed engineering teams in the development of a large hierarchical system.  The Minimum Viable Product (MVP) implementation will have both Frontend and Backend on a single physical system but can support multiple users and administrators operating on separate instances of the Frontend GUI communicating to a single Backend server.  This implementation will be scalable with minimal change to a distributed enterprise architecture for future releases.

Backend will contain a database for project information, System information such as User names, and email addresses which will map to Owner and Creator properties to data objects and Reference data.

The backend will be developed to contain reference frameworks from MITRE (ATT\&CK and EMB3D and the NIST SP800-53 Controls Catalog). Add-on Tools will allow users to search, review and associate this data via reference to valid nodes.

It will have backend tools to support telemetry to include a separately accessible dashboard for telemetry display using Grafana.  Through this interface an Admin User will be able to select and save System Data.

It will provide a desktop Graphic User Interface (GUI) application which connects to a Backend and navigates the System nodes in the dataset, displays data from sub-graphs on selected system (the SoI), Displays sub-graph node properties in data drawers, edits nodes and their properties and commits changes to the backend.

The GUI will have Add-on Tools to operate on specific Nodes to:
Navigate the System Hierarch and select a System of Interest (SoI) or clone specific node properties.
Review and associate Reference Data to Valid nodes in the SoI.
Display and manage the Hierarchy of Requirements in SysML 2.
Display and manage State Transition diagrams in SysML 2 using existing (:State) nodes and [:TRANSITIONS_TO] relationships.
Display and Manage Functional Flow diagrams in SysML 2.
Develop and display the STPA Control Flow of an SoI by assigning Functions and Interfaces to STPA Roles.
Develop, Display and analyze Asset Loss as an Attack Tree.



The GUI will produce reports which include System Specifications and System descriptions based on Backend data.



### 1.2.2 SSTPA Tool Theory of Execution

(:System) fail when they either stop producing value or produce harm (negative value).  This can happen with failure of function (not modeled in SSTPA Tools and not its purpose) or when **Security Assurances** are removed from (:Asset) by **Attack** or flaws in the System's exposed in (:Environment) subject to (:Hazard).    System Security is responsible for:

Identifying **Assets**

Assigning criticality regimes to each (:Asset) as a property

Assigning Security Assurances to each (:Asset) as a property

Identifying (:Hazard) to each (:Asset)

Developing (:SecurityControl) and relating them to (:Asset)

Developing (:Countermeasure) to satisfy (:SecurityControl) assurance

Developing (:Requirement) to realize the (:Countermeasure).



Key to managing complexity is the focus on the "system" as the directed analytical graph of "Systems of Interest (SoI)". Each SoI forms a sub-graph of identical form which are analyzed by the tool independently.  The tool allows expert  decomposition (:System) into subordinate (:System) in a hierarchical (tree) structure using a rich system model consisting of (:Environment), (:SystemFunction), (:Interface),(:Component), (:Purpose), (:State), (:ControlStructure), and (:Asset) nodes each a large set of default and user configurable properties.  The hierarchy is created by declaring an(:Component) as a (:System) which causes a new sub-graph to be created using the full rich system model.  The (:System) in this sub-graph is parented to that(:Component) from the superior sub-graph. In this way, the most complex systems are modeled.



SSTPA Tools contains a main GUI for creating new Nodes, assigning property values and associating relationships. A key aspect of SSTPA Tools is all data is "owned" by a User.  Any user may change data but when a user changes data or relationships they do not own, the owner is notified via a internal message center tool.  SSTPA Tools also contains a set of "Add-on Tools" which perform analysis and assist in system development and analysis using SysML 2.0 MBSE visualizations where applicable.



The core innovation of the SSTPA Tool is the treatment of The (:System) as the summation of  (:System) components addressed individually as Systems of Interest (SoI).  The Graphic User Interface (GUI) will allow navigation through the hierarchy and allow selection of a single SOI.  The components of that SOI will be organized by type and presented to the User/Analyst for edit and display.



#### 1.2.2.1  SSTPA Tools Work Flow

SSTPA Tools is intended to be a human centered set of tools allowing experts to design, specify and realize intrinsically safe and secure systems.  The intent is to be as flexible as possible to allow the human ingenuity of the users to identify and resolve the complexities of system security and create a verifiably safe and secure system which produces evidence to satisfy external certification authorities in multiple criticality domains (safety, flight, surety, mission and security).  SSTPA Tools primarily support a top-down system decomposition with bottom-up system realization. Future versions of SSTPA Tools will have a Sandbox capability allowing users to develop an isolated System independently for later integration with the full model.



The expected typical work-flow is:

1. Organization is contracted to realize a "Capability" valued by a customer or client.
2. Customer or client provides the organization with a description of the "Capability", a Specification containing capability requirements, and a Statement of Work (SoW) identifying criticalities and certifications needed the organization needs to meet.
3. The Organization has or purchases SSTPA Tools (good choice!) to use in parallel with DOORS and MBSE tools such as No-Magic CAMEO.
4. Installer uses the SSTPA Tools Installer to install SSTPA Tools on a single computer (MVP version) and becomes the Admin and SSTPA Tools first User.
5. Members of the Engineering team register with SSTPA Tools as Users via the Admin.
6. A User creates the Capability from customer provided description, Specification and Statement of Work and populates Capability Requirement Nodes.
7. Organization creates Tier 1 architecture (Systems Elements, Functions and Interfaces) identifies Assets, criticalities and assurances outside the SSTPA Tool
8. User, uses SSTPA Tool to capture Tier-1 architecture and uses Add-on Requirements Tool to allocate Capability Requirement to Tier-1 Systems ( allocated to System-->Purpose).
9. User Uses SSTPA Tool derive and allocate requirements from Purpose to Interfaces Functions and Elements within each SoI.
10. Users Use SSTPA Tools to identify Connections to other Systems and assigned Interfaces to participate.
11. User Specifies Tier-1 Connections within SSTPA Tool, develops System Environment, Purpose Constraints, Hazards and States for each SoI.
12. Users use SSTPA Tools to develop Controls and Countermeasures sufficient to protect Assets from Loss
13. Users develop validation criteria which if met assure the System is functional, safe and secure
14. Users derive child Systems from Elements which instantiates Core System data model for the new SoI and copies all requirements allocated to the Element into the Purpose of the Child System.
15. User uses SSTPA Tool to repeat steps 9-14 until the capability is decomposed to the point where it can be realized.
16. Users develop Verification procedures for the lowest tier systems to satisfy requirements and begin the process of realization
17. Organization realizes the highest tier system and performs verification of requirements (requirements implemented correctly) then validates the System (system meets intended purpose)
18. User uses SSTPA Tools to generate body of evidence to assure external certification authority the System is Safe and Secure and acceptable for the criticality domains it must work in.
19. The organization integrates the lower tier systems with their peers to create the next lower tier System
20. User uses SSTPA Tools to again create Verification procedures for Requirements of that lower tier System.
21. Organization performs verification of requirements (requirements implemented correctly) then validates the System (system meets intended purpose)
22. User again uses SSTPA Tools to generate body of evidence to assure external certification authority the System is Safe and Secure and acceptable for the criticality domains it must work in.
23. Cycle repeats until the entire Capability is realized, verified, validated and certified.
24. Organization uses SSTPA Tool to support capability sustainment throughout lifecycle to include continuous certification and accreditation.





### 1.2.3 SSTPA Tool in the Systems Engineering Space



DOORS is a powerful tool for managing requirements, and can associate cyber-security properties (a task it is never challenged to do) its relational database structure allows for only storage and recall.  SSTPA Tool with its graph-based structure allows experts to surface insights down and across the hierarchy.



CAMEO is a powerful Model Based Systems Engineering (MBSE) tool but its focus is on individual system design and cannot be easily adapted for cyber-security (it has been tried).  SSTPA Tool replicates CAMEOs requirements diagraming capability for System Security.



Both these tools and others like them (e.g. the entire IBM Rational series of Tools) are focused on systems engineering of the primary behaviors of a System.  Primary behaviors are those the customer wants and is willing to pay for.  These tools do not do a good job developing System Security behaviors needed to protect Assets needed to perform the system's primary behaviors.  These tools can configuration manage System Security requirements and model System Security functions which align with SysML but that is not their purpose.  SSTPA Tools intends to be orthogonal to these tools by focusing on System Security.  It is expected the users of SSTPA Tools will  likely NOT enter primary functional requirements into SSTPA Tool or use it to manage the primary behavior of the Project.  SSTPA Tools may need to model primary behavior functions when they have associated criticality.  The focus of SSTPA Tools is not to design the primary behavior, but develop controls, countermeasures and requirements needed to assure it meets its criticality  assurances and that these attributes can be effectively documented to achieve Certification and/or Approval to Operate.



SSTPA is derived from STPA and is also intended to support Safety analysis, Flight Criticality analysis, Mission Criticality analysis, Surety analysis as well as Cyber-Security.  The term 'Surety" is used to include special purpose certification needs to include: Nuclear surety, Rust abatement, pharmaceutical purity, Cyber-Safe etc... Use in these domains may need additional add-on tools and reports, but hte structure of SSTPA Tools should be sound enough to address these needs.





# 2 SSTPA Tools Architecture



the SSTPA Tool architecture SHALL be implemented with minimum complexity.  When integrating a capability, the developer SHALL asses if libraries or functions already existing in the code-base can execute the new capability before introducing a new library or function.



SSTPA Tools SHALL be implemented with 4 independently operable segments:  The Startup Software, The Backend, The Frontend, and the Installer.



The Startup Software will allow a User to startup the Frontend application and connect to the Backend.  It will contain security features which authenticate the User prior to launching applications.  In the MVP implementation the Startup Software will startup both the Backend, then the Frontend on the same computer.  The security features will be placeholders for enterprise security post MVP.

The Startup Software will be displayed as a typical desktop application with icon.  Startup Software will be the application the user launches when starting SSTPA Tools.



The Backend will contain the server hosted graph database and associated software.  The Backend is intended to persistently operate and support multiple users.



The Frontend  consists of a desktop application hosting a GUI and Add-on Tools which will be dynamically loaded from Manifest.  The User will primarily interact with the GUI and use Add-on Tools for analysis, design and reports.



The Installer is the product shipped to the customer and the product of the software development pipeline. In the MVP product, the Installer will install the Startup Software, Frontend and Backend on Windows, Mac and Linux based systems.



## 2.1 SSTPA Tool Constraints

The SSTPA Tools SHALL operate on an air-gapped Microsoft Windows 11 Enterprise based network with no access to the internet.

As the SSTPA tool is developed on a Linux based system the SSTPA Tool SHALL also function on a system with the following characteristics: Operating System: Ubuntu Studio 25.04

KDE Plasma Version: 6.3.4

KDE Frameworks Version: 6.12.0

Qt Version: 6.8.3

Kernel Version: 6.14.0-27-generic (64-bit)

Graphics Platform: Wayland

Processors: 28   Intel  Core  i7-14700K

Memory: 31.1 GiB of RAM

Graphics Processor: Intel  Graphics



## 2.2  SSTPA Tool Component Copyright



All SSTPA Tool software components SHALL include a copyright statement:



"2025 Nicholas Triska. All rights reserved.

The SSTPA Tools software and all associated modules, binaries, and source code are proprietary intellectual property of Nicholas Triska.  Unauthorized reproduction, modification, or distribution is strictly prohibited.  Licensed copies may be used under specific contractual terms provided by the author."





All SSTPA Data components SHALL include a copyright statement:



"2025 Nicholas Triska.

The SSTPA Tools is proprietary software. However, users retain ownership of data and reports generated during legitimate use of the software, except for embedded proprietary schemas and templates."







# 3 Data Models

SSTPA Tools is a data centric systems engineering expert tool.  The Backend SHALL host the following data sets:

* Product Data
* User Data
* Core System Data
* Reference Data
* Help Data
* Example Data



Product Data will consist of SSTPA Tool information accessible to the User through the gear icon on the Frontend GUI Brand Bar.

User Data will consist of data on Users and Admins for SSTPA Tools.  It will relate to messages to and messages sent by the User.  All data elements in the Core System Data SHALL be owned by a User or Admin through "Owner" and "Creator" properties on that data in the Core Systems Data.  Admins will enroll new Users by creating an Account on the Startup Software which will create a new (:User) in the User Data.  New Users will own no data and have only one message from SSTPA Tools welcoming them.  Admins will disenroll Users (leaving the project presumably) who will own data and have both sent and received messages in their mailboxes.  Admins when disenrolling Users SHALL transfer ownership of data from the disenrolled User to any current User or set of Users and transfer or export messages related to the disenrolled User.  Admins SHALL transfer or delete all Sandboxes related to the disenrolled User.



Core System Data is the data concerning the System the team of Users is creating.  This data set will be hierarchical in structure with a (:Project) node at its root.  (:Project) consist of administrative details on the project and it can parent User (:Sandbox) and (:System) nodes.  Only an Admin can create, or edit a (:Project) but a User may relate a (:System) to it.  (:Sandbox) may be created and destroyed by Users at any time and are intended for tutorials, hypothetical designs and experiments.  In any case, the User may clone elements of the Sandbox into the canonical System model at any time.

Reference Data is data packaged with SSTPA Tools representing various cybersecurity frameworks to include:

* CNSSI 1253
* NIST SP 800-53 Catalog of Controls
* MITRE Cyber Survivability Attributes
* MITRE Cyber Resiliency Framework and Cyber Survivability Attributes (MITRE Technical Report MTR210700R1)
* MITRE ATT&CK/ATLAS Frameworks
* MITRE EMB3D Framework
* User Created Nodes in Control or Framework format

SSTPA Tools has a strong ownership model so the ownership of NIST data belongs to NIST and us used under license and cannot be altered.  MITRE data likewise is owned by MITRE and used under license and cannot be altered.  The Reference Tool allows Users to clone properties from NIST and MITRE nodes to a User  owned node un the Core System Data.  Likewise Users can clone other User created Nodes or create them and register them for use by all other Users in the Reference Data.

The SSTPA Sustainment System will download current framework data from source and archive it.  It will then normalize archived data into an intermediate format.  Graph data to be stored as Reference Data will be created from that normalized data format.  Owning to license restrictions on data integrity, all properties SHALL be maintained, the data will be reformatted into nodes, relationships and properties.

Help Data will include terms and definitions in support of a "Hover Help" capability accessed in the GUI using the Gear Icon in the Branding Bar.

Example Data consists of example projects Users may use as exemplars or as part of the Tutorial.  This data has the same schema and rules as the Core System Data excepting this data is both "created" and "Owned" by the SSTPA Tools and ownership cannot change, however Users can modify the Example Projects in any way allowed for the Core System Data.  SSTPA Tools Backend SHALL maintain a backup copy of Example Data.  The Frontend GUI SHALL command the Backend to "Reset" specific projects in Example Data on command of a User using a menu option accessed through the Gear Icon in the Branding Bar. In this way, Users can make modifications to an example project as part of a tutorial or just experimentation, then reset the example project.



## 3.1   Product Data

Product Data will consist of data on the SSTPA Tools application itself.  The Root Node SHALL be (:Product) with properties to include:
version number
build number
SSTPA Tools license
Release date

(:Product) shall be related to open source applications integrated into SSTPA Tools.  These nodes SHALL at minimum contain their name, version, source and license as properties.

Product Data SHALL be accessible as read only through the gear icon on the Frontend GUI Brand Bar.

The Development Environment Software Pipeline SHALL write Product Data to the Backend Database.
Product Data SHALL be owned by SSTPA Tools with Owner email: as "nihlo2025@proton.me".



## 3.2   User Data

SSTPA Tools is intended to support a large dispersed engineering team. In this initial version the Backend and Frontend will be bundled for use on a single system.  Data in the Core Data Model will have ownership and also record the creator.  Owner and creator contact information will be captured as email address.  SSTPA Tools will have an add-on tool called "Message Center" which allows users to message each other and allows the system to notify Users of changes to properties and relationships on data they own.

SSTPA Tools shall have two account types, (:User) and (:RootAdmin).  (:User) may be either a general User or an Admin based on the value of the property IsAdmin.  Access to data and privileges will depend on this value.

Data on Users: (:User)
Properties on (:User) SHALL be UserName, Password, CreateDate and IsAdmin
UserName is a user selected string set on account creation.
Password is the SHA-384 cryptographic hash of the password the user selected on account creation
CreationDate is the datetime() the account was created
IsAdmin is a Boolean which if true means the User is an Admin.  IsAdmin can only be set to "TRUE" by a User who is an Admin.

Users can modify Core System Data nodes, relationships and properties in Core Data. On Commit, ownership SHALL remain unchanged if the User is the owner else the Data Owner and Owner email SHALL change to the current User and the previous owner messaged on the change to include changes to their previously owned data.

Data on RootAdmins (:RootAdmin)
The (:RootAdmin) is an account set on installation and the Installer of SSTPA Tools becomes the RootAdmin The RootAdmin has all the privileges of an Admin and all the privileges of a general User.  The RootAdmin account can never be removed.
(:RootAdmin) has the same properties as (:User) omitting the property "IsAdmin".

Data on Admins:
Admins are (:User) where IsAdmin is "True"
Admins cannot own data but can edit and commit certain specific properties identified as for Admins Only otherwise their Commit is invalid.  Admin Users can access the Backend Server and access all logs and telemetry from the backend.
Admins can read, modify and delete all (:Message) data.
Admins can enroll new (:User) account and set the (:User {IsAdmin}) to either "True" or "False".
User Data is owned by the User.

### 3.2.1  Onboarding

Onboarding new (:User) accounts is managed by the Admin Tool Add-on Tool.

### 3.2.2 Reserved



### 3.2.3 Reserved



### 3.2.4 Messaging Data Model

SSTPA Tools Messaging model assigns each (:User) a single (:Mailbox) which contains (:Messages)
the (:Mailbox) has an (:Inbox) for (:Message) sent to the (:User) and an (:Outbox) for (:Message) sent by the (:User)
The (:User) may create new (:Message), edit it, send it or discard it.
The (:User) may read (:messages) either sent by the User or addressed to the User and no other unless the User is an Admin.
(:User) may reply to a message sent to them with an outgoing message that copies the body of the message in the response.

(:Mailbox) Node properties:
MailboxID
Owner
OwnerEmail
UnreadCount
Created
LastTouch

(:Message) Nodes properties:

MessageID / uuid
Subject
Body
MessageType enum {DIRECT, CHANGE_NOTIFICATION, SYSTEM}
SentAt
ReadAt
DeletedAt
Sender
SenderEmail
Recipient
RecipientEmail
RelatedNodeHIDs
RelatedRelationshipTypes
CommitID
IsRead
IsDeleted
RequiresApproval (default False)
ApprovalStatus enum {NOT_APPLICABLE, PENDING, APPROVED, REJECTED}



Relationships

(:User)-[:OWNS_MAILBOX]->(:Mailbox)

(:Mailbox)-[:HAS_MESSAGE]->(:Message)


(:Message)-[:RELATES_TO]->(n) where n is any Core Data Model node.

Messaging data (User Data) is not part of the Engineering Translation Set
(Section 3.7.2) and is never translated to SysML 2.0 or KerML 1.0.


(:Message)-[:REPLY_TO]->(:Message) for replies


## 3.3 SSTPA Tool Core System Data Model

SSTPA Tools  will have the following data models:

Core Data Model: supports the primary purpose of SSSTPA Tool modeling large complex systems
The Core Data Model is the authoritative graph model for representing data on a project.  
The Core Data Model SHALL be implemented as a Neo4j graph. The Backend SHALL validate all node labels, relationship types, relationship direction, cardinality, SoI membership, and recursive traversal constraints before committing graph mutations.
The Core Data Model SHALL be the single authoritative schema used by the Backend, Frontend, Add-on Tools, reports, and validation logic.


### 3.3.1 Canonical Modeling Concepts

#### 3.3.1.1 System of Interest

A System of Interest (SoI) is the analytical sub-graph rooted at exactly one (:System) node.
All nodes created as part of that SoI SHALL share the same HID Index as the root (:System), except child (:System) nodes created through (:Component)-[:PARENTS]->(:System).
The SoI boundary SHALL be determined by HID Index.
The Backend SHALL treat HID Index as the canonical SoI membership indicator.
Cross-SoI relationships SHALL be prohibited unless explicitly allowed by this SRS.

#### 3.3.1.2 Behavior

System behavior SHALL be represented only by:

* (:SystemFunction), for behavior internal to the SoI
* (:Interface), for behavior exposed to, or interacting with, other Systems

The Core Data Model SHALL NOT define a separate (:Behavior) node.

Use Cases describe named interactions between external Actors and the SoI through which the SoI delivers a defined behavior satisfying a (:Purpose).  Use Cases SHALL be modeled as (:UseCase) nodes owned by (:Purpose).  (:UseCase) is not a behavior node; it is a named scenario that groups (:SystemFunction) and (:Interface) nodes together under a purposeful interaction, and is the mechanism by which external Actors are associated to the boundary of the SoI.


#### 3.3.1.3 Purpose, Assets, and Security Assurance

(:Purpose) represents human-imposed intent for the engineered System.
(:Asset) represents something valuable having Criticality that requires Assurance.
(:Security) represents the security view containing Controls and Countermeasures used to protect Assets.

Purpose is realized by Requirements and validated by Validation procedures.

Assets are protected by Controls and Countermeasures.

The relationship between an (:Asset) and the (:Interface), (:SystemFunction), (:Component), and (:State) nodes of an SoI is expressed through three semantically distinct typed relationships that describe the nature of the entity's engagement with the Asset:
[:HOLDS] — the entity contains the Asset for the full duration of the associated State but does not require the Asset to perform its purpose.
[:TRANSPORTS] — the entity has a transient relationship with the Asset; it does not contain the Asset for the full duration of the State and does not require the Asset to perform its purpose.
[:USES] — the entity requires the Asset to perform its purpose during the associated State.
These typed relationships replace the generic [:CONTAINS]->(:Asset) relationship for (:Interface), (:SystemFunction), (:Component), and (:State) nodes.  Entity-to-Asset relationships are state-scoped: a single entity may have a different relationship type to the same Asset in different States.  Each typed entity-to-Asset relationship carries trace metadata properties that support audit, re-trace, and invalidation detection.
An entity that holds any CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to an Asset inherits the Asset's Criticality and Assurance properties by OR-union across all Assets to which it has CURRENT relationships.  (:Connection) nodes inherit Criticality and Assurance properties from the (:Interface) nodes that participate in them.
Protection (:Requirement) nodes are generated for each entity that has a CURRENT relationship to an Asset, one Requirement per true Assurance property on the Asset, stating that the entity SHALL protect that Assurance of the Asset.

Security assurance is represented through the relationship chain:

(:Asset)

* <-[:THREATENS]-(:Hazard)
* <-[:MITIGATES]-(:SecurityControl)
* <-[:SATISFIES]-(:Countermeasure)
* \-[:HAS_REQUIREMENT]->(:Requirement)
* \-[:VERIFIED_BY]->(:Verification)


#### 3.3.1.4 Hazard and Attack

A (:Hazard) is a system condition or environmental condition that can make compromise of an Asset possible to include the presence of a Threat Actor or conditions within the system such as a Control Action.
An (:Attack) is an action, technique, tactic, procedure, or exploit path that acts on an Element, Function, Interface or defeats a Countermeasure.
A Hazard SHALL NOT be treated as the same concept as an Attack.  (:Attack) is a projection of a (:Hazard) into the (:System) through action on an (:Component). (:Interface), or (:SystemFunction).

Hazards MAY reference external threat framework items.
Attacks MAY reference external attack framework items.
Hazards and Attacks SHALL be related only when the Attack is a concrete means by which the Hazard may be realized.


#### 3.3.1.5 Loss

A (:Loss) represents a specific unacceptable compromise case for:

* one (:Asset)
* one Criticality
* one Assurance property
* one (:Environment)
Each (:Loss) SHALL have exactly one true Criticality property and exactly one true Assurance property.

Loss SHALL be modeled as an analytical root object.
The attack tree associated with a Loss SHALL be represented as data on the (:Loss) node or through explicit Loss analysis relationships.
The Loss node SHALL NOT itself be defined as the DAG. The DAG is the analytical representation of how the Loss may occur.



#### 3.3.1.6 Control, Countermeasure, Requirement, Verification

A (:SecurityControl) is an abstract security or assurance objective.
A (:Countermeasure) is a concrete feature, design element, procedure, or mechanism that satisfies one or more Controls.
A (:Requirement) is a specification statement that realizes Purpose, Constraint, Countermeasure, Interface, Function, Element, Connection, Capability, or other authorized intent.
A (:Verification) is a procedure confirming that a Requirement is implemented correctly.



The canonical traceability direction SHALL be:


(:SecurityControl)-[:ENFORCES]->(:Constraint)
(:SecurityControl)-[:MITIGATES]->(:Hazard)
(:Countermeasure)-[:SATISFIES]->(:SecurityControl)
(:Countermeasure)-[:HAS_REQUIREMENT]->(:Requirement)
(:Requirement)-[:VERIFIED_BY]->(:Verification)


Reverse semantic interpretation SHALL NOT be used to define traceability.


#### 3.3.1.7 Validation

(:Validation) is a procedure confirming that the realized System satisfies its intended Purpose in its intended Environment.
Validation SHALL be related to (:Purpose), not to individual implementation Requirements unless explicitly added in a future version.


#### 3.3.1.8 Assurance Case / GSN

(:GsnGoal), (:GsnStrategy), (:GsnContext), (:GsnJustification), (:GsnAssumption), and (:GsnSolution) SHALL represent Goal Structured Notation (GSN) assurance-case artifacts.

GSN nodes SHALL be used to structure evidence and argumentation about Assets, Loss, Verification, Validation, and other evidence-bearing objects.

GSN relationships SHALL use Neo4j relationship syntax and UPPERCASE_SNAKE_CASE.

---


### 3.3.2 Canonical Modeling Rules

All node labels SHALL be singular.
All relationship names SHALL use UPPERCASE_SNAKE_CASE.
All relationships SHALL use Neo4j directed relationship syntax:
(:Source)-[:RELATIONSHIP_NAME]->(:Target)

Reverse relationships SHALL NOT be explicitly created unless required for performance or explicitly authorized by this SRS.
All properties with no value SHALL use Null
Relationship names SHALL be unique in meaning across the Core Data Model.
Duplicate logical relationships between the same source node, target node, and relationship type SHALL be prohibited unless multiplicity is explicitly allowed and distinguished by relationship properties.

Recursive relationships SHALL declare whether they are:

* acyclic, or
* cyclic-by-design with bounded traversal


The Backend SHALL enforce recursive relationship constraints.
The system SHALL NOT execute unbounded recursive graph traversals.
All list-returning Backend endpoints SHALL support pagination and maximum result limits.


Node labels SHALL be singular UpperCamelCase with no underscores.

A node label SHALL NOT be identical (case-insensitive) to a KerML 1.0 or
SysML 2.0 reserved word, nor to the name of a KerML 1.0 metaclass (e.g., Element,
Feature, Type), where the SSTPA meaning differs from the standard meaning.
Display names are exempt from this rule; the GUI maps labels to display names
per Section 3.3.9.


---


### 3.3.3 Canonical Node Labels

The Core Data Model SHALL include exactly the following node labels.
The "Model Domain" column assigns each label to its translation target
(Section 3.7): SYSML, KERML, or NONE (not translated).

Project / hierarchy:
| Label | Display Name | Model Domain |
|---|---|---|
| (:Project) | Capability | SYSML |
| (:Sandbox) | Sandbox | SYSML |
| (:System) | System | SYSML |

System structure and behavior:
| (:Environment) | Environment | SYSML |
| (:Connection) | Connection | SYSML |
| (:Interface) | Interface | SYSML |
| (:SystemFunction) | Function | SYSML |
| (:Component) | Element | SYSML |
| (:State) | State | SYSML |

Intent and specification:
| (:Purpose) | Purpose | SYSML |
| (:UseCase) | Use Case | SYSML |
| (:Constraint) | Constraint | SYSML |
| (:Requirement) | Requirement | SYSML |
| (:Validation) | Validation | SYSML |
| (:Verification) | Verification | SYSML |

Perspectives:
| (:Perspective) | Perspective | NONE (structural container) |
| (:FunctionalFlow) | Functional Flow | SYSML |
| (:ControlStructure) | Control Structure | KERML |
| (:Security) | Security | KERML (as package) |

STPA control loop:
| (:ControlAlgorithm) | Control Algorithm | KERML |
| (:ProcessModel) | Process Model | KERML |
| (:ControlAction) | Control Action | KERML |
| (:Feedback) | Feedback | KERML |
| (:ControlledProcess) | Controlled Process | KERML |

Security analysis:
| (:Asset) | Asset | KERML |
| (:DerivedAsset) | Derived Asset | KERML |
| (:Regime) | Regime | KERML |
| (:Hazard) | Hazard | KERML |
| (:Loss) | Loss | KERML |
| (:Attack) | Attack | KERML |
| (:Countermeasure) | Countermeasure | KERML |
| (:SecurityControl) | Control | KERML |

GSN assurance case:
| (:GsnGoal) | Goal | KERML |
| (:GsnStrategy) | Strategy | KERML |
| (:GsnContext) | Context | KERML |
| (:GsnAssumption) | Assumption | KERML |
| (:GsnJustification) | Justification | KERML |
| (:GsnSolution) | Solution | KERML |

Nodes produced by analysis rather than by system architecture ((:Attack),
(:Hazard), (:Loss), (:Countermeasure), (:SecurityControl), (:DerivedAsset),
GSN labels) remain a distinct analytical grouping.





#### 3.3.3.1  Subordinate Relationships under (:Purpose)

Purpose captures a single "reason for being" of the (:System).  One Default (:Purpose) node SHALL be created when a new (:System) is created.

(:Purpose)-[:HAS_REQUIREMENT]->(:Requirement)
(:Purpose)-[:HAS_VALIDATION]->(:Validation)
(:Purpose)-[:HAS_CONSTRAINT]->(:Constraint)

(:Purpose) also captures perspectives on the (:System):
(:Purpose)-[:HAS_USECASE]->(:UseCase)
(:Purpose)-[:HAS_CONTROL_STRUCTURE]->(:ControlStructure)
(:Purpose)-[:HAS_FUNCTIONAL_FLOW]->(:FunctionalFlow)


#### 3.3.3.2  Subordinate Relationships under (:Asset)

(:Asset) is the component of the system which needs security assurances
(:Asset)-[:HAS_LOSS]->(:Loss)
(:Asset)-[:HAS_GOAL]->(:GsnGoal)


### 3.3.4 Canonical Relationship Model



#### 3.3.4.1 Project and System Hierarchy


(:Project)-[:HAS_SYSTEM]->(:System)
(:Project)-[:HAS_REQUIREMENT]->(:Requirement)
(:Sandbox)-[:HAS_SYSTEM]->(:System)
(:Component)-[:PARENTS]->(:System)

Constraints:

* A (:Project) SHALL be the root of the project hierarchy.
* A (:Sandbox) SHALL be outside the Capability baseline.
* A (:System) SHALL NOT be related to both (:Project) lineage and (:Sandbox) lineage.
* A (:Component) SHALL parent zero or one child (:System).
* (:Component)-[:PARENTS]->(:System) SHALL form a Directed Acyclic Graph.
* Child (:System) HID Index SHALL be derived from the parent (:Component) HID Index and Sequence Number.



#### 3.3.4.2 System Composition

(:System)-[:ACTS_IN]->(:Environment)
(:System)-[:HAS_CONNECTION]->(:Connection)
(:System)-[:HAS_INTERFACE]->(:Interface)
(:System)-[:HAS_FUNCTION]->(:SystemFunction)
(:System)-[:HAS_ELEMENT]->(:Component)
(:System)-[:REALIZES]->(:Purpose)
(:System)-[:EXHIBITS]->(:State)
(:System)-[:HAS_ASSET]->(:Asset)


Constraints:

* A (:System) SHALL have at least one (:Purpose).
* A (:System) SHALL have at least one (:Environment).
* A (:System) SHALL have at least one (:State).
* A (:System) SHALL have exactly one (:Perspective) unless explicitly extended in a future version.
* (:Connection) SHALL NOT participate in hierarchy relationships.
* A (:Connection) SHALL be owned by exactly one (:System) through [:HAS_CONNECTION].



#### 3.3.4.3 Environment, State, and Hazard

(:Environment)-[:HAS_HAZARD]->(:Hazard)

(:State)-[:TRANSITIONS_TO]->(:State)
(:State)-[:HAS_HAZARD]->(:Hazard)

(:State)-[:HOLDS]->(:Asset)
(:State)-[:TRANSPORTS]->(:Asset)
(:State)-[:USES]->(:Asset)

(:State)-[:VALID_IN]->(:Environment)

Constraints:

* [:TRANSITIONS_TO] SHALL be the canonical representation of state transition.
* The Core Data Model SHALL NOT contain a (:Transition) node.
* [:TRANSITIONS_TO] SHALL be cyclic-by-design.
* All [:TRANSITIONS_TO] traversal SHALL be bounded.
* Duplicate logical transitions between the same source and destination (:State) SHALL NOT exist unless distinguished by relationship properties.
* TransitionKind SHALL be one of: FUNCTIONAL, COUNTERMEASURE_REQUIRED, BOTH.
* If TransitionKind is COUNTERMEASURE_REQUIRED or BOTH, RequiredByCountermeasureHID and/or RequiredByCountermeasureUUID SHALL identify an existing (:Countermeasure).
* The referenced (:Countermeasure) SHALL belong to the same SoI unless an explicitly justified cross-SoI analytical exception is recorded.
* Only one of [:HOLDS], [:TRANSPORTS], or [:USES] SHALL exist between a specific (:State) and a specific (:Asset).
* [:HOLDS], [:TRANSPORTS], and [:USES] on (:State) nodes are the canonical representation of the state-scoped Asset relationship; [:CONTAINS]->(:Asset) SHALL NOT be used for (:State) nodes.
* All three relationship types SHALL carry the trace metadata properties defined in Section 3.3.4.6a: TraceStateHID, TraceDate, TraceVersion, TraceStatus, TraceSessionID.
* [:VALID_IN] records that a (:State) is analytically relevant in a given
(:Environment) for the purposes of Loss analysis. A (:State) MAY be valid
in zero or more (:Environment) nodes. An (:Environment) MAY have zero or
more valid (:State) nodes.
* [:VALID_IN] SHALL be scoped to the same SoI. A (:State) node SHALL NOT
have a [:VALID_IN] relationship to an (:Environment) that belongs to a
different SoI.
* The Loss Tool uses [:VALID_IN] relationships to determine which States
appear at Tier 1 of the Attack Tree for a given Loss-Environment pair.
A (:State) that has no [:VALID_IN] relationship to the Loss's (:Environment)
SHALL NOT appear in that Loss's Attack Tree.
* [:VALID_IN] does NOT replace or duplicate [:TRANSITIONS_TO]. The two
relationships serve different purposes: [:TRANSITIONS_TO] models behavioral
state machine transitions; [:VALID_IN] models analytical scoping of States
to Environments for Loss analysis.
* StateSequence on (:State) nodes SHALL be used to set default SANDSequence
values on [:AT_RELATES_TO] SAND relationships in the Loss Tool. It represents
the User-assigned lifecycle order of States within the SoI.



#### 3.3.4.4 Connections and Cross-System Interaction

(:Interface)-[:PARTICIPATES_IN]->(:Connection)
(:Interface)-[:CONNECTS]->(:SystemFunction)

Constraints:

* Cross-System interaction SHALL be modeled through (:Connection).
* Each (:Connection) SHALL relate to two or more (:Interface) nodes.
* An (:Interface) SHALL NOT participate more than once in the same (:Connection).
* Connection ownership SHALL NOT imply that all participating Interfaces belong to the owning System.
* (:Connection) Requirements SHALL belong to the owning SoI.

#### 3.3.4.5 Functional Flow

(:SystemFunction)-[:FLOWS_TO_FUNCTION]->(:SystemFunction)
(:SystemFunction)-[:FLOWS_TO_INTERFACE]->(:Interface)

(:FunctionalFlow)-[:CONTAINS]->(:SystemFunction)
(:FunctionalFlow)-[:CONTAINS]->(:Interface)
(:FunctionalFlow)-[:CONTAINS]->(:Connection)
(:FunctionalFlow)-[:CONTAINS]->(:Component)
(:FunctionalFlow)-[:CONTAINS]->(:Asset)

Constraints:

* Functions and Interfaces are abstractions.
* Functions and Interfaces SHALL be allocated to Elements to be realized.
* Only one of [:HOLDS], [:TRANSPORTS], or [:USES] SHALL exist between a specific entity node and a specific (:Asset) node. A single entity node SHALL NOT simultaneously have more than one typed Asset relationship to the same (:Asset).
* [:CONTAINS]->(:Asset) SHALL NOT be used for (:SystemFunction), (:Interface), or (:Component) nodes. The authorized relationships are [:HOLDS], [:TRANSPORTS], and [:USES].
* Asset relationship types carry semantic meaning about the entity's dependency on and exposure to the Asset as follows:

  * [:HOLDS]: the entity contains the Asset for the full duration of the associated State but does not require the Asset to perform its purpose.
  * [:TRANSPORTS]: the entity has a transient relationship with the Asset; it does not require the Asset to perform its purpose.
  * [:USES]: the entity requires the Asset to perform its purpose during the associated State.
* Entity-to-Asset relationships are state-scoped. The TraceStateHID property on the relationship SHALL record the HID of the (:State) in which the relationship was assigned.
* Asset relationship assignment SHALL NOT imply ownership transfer across SoI boundaries.
* All three relationship types SHALL carry the trace metadata properties defined in Section 3.3.4.6.1.



#### 3.3.4.6 Element, Function, Interface, and Asset Allocation and Trace Relationships

(:SystemFunction)-[:ALLOCATED_TO]->(:Component)
(:Interface)-[:ALLOCATED_TO]->(:Component)

(:SystemFunction)-[:HOLDS]->(:Asset)
(:SystemFunction)-[:TRANSPORTS]->(:Asset)
(:SystemFunction)-[:USES]->(:Asset)

(:Interface)-[:HOLDS]->(:Asset)
(:Interface)-[:TRANSPORTS]->(:Asset)
(:Interface)-[:USES]->(:Asset)

(:Component)-[:HOLDS]->(:Asset)
(:Component)-[:TRANSPORTS]->(:Asset)
(:Component)-[:USES]->(:Asset)

Constraints:

* Functions and Interfaces are abstractions.
* Functions and Interfaces SHALL be allocated to Elements to be realized.
* Assets MAY be contained by Elements, Functions, Interfaces, or States.
* Asset containment SHALL NOT imply ownership transfer across SoI boundaries.



##### 3.3.4.6.1 Trace Relationship Properties

The three Asset trace relationship types [:HOLDS], [:TRANSPORTS], and [:USES] — when used between (:SystemFunction), (:Interface), (:Component), or (:State) nodes and (:Asset) nodes — SHALL carry the following properties on the relationship itself.
These properties are relationship properties, not node properties.  They are stored on the relationship edge in the graph, not on either endpoint node.
Required trace metadata properties (all three relationship types):
Property	Type	Edit	Default	Description
TraceStateHID	String	fixed (set on creation)	"N/A"	HID of the (:State) node in whose context this relationship was assigned by the Trace Tool. Binds the entity-Asset relationship to its analytical State context.
TraceDate	datetime	fixed (set on creation/update)	"N/A"	Timestamp of the Trace Tool commit session that created or last updated this relationship.
TraceVersion	Integer	fixed (system-managed)	1	Monotonically increasing integer, incremented on each Trace Tool commit that creates a new version of this (entity, Asset) pair. Initial value is 1.
TraceStatus	Enum {CURRENT, SUPERSEDED, INVALIDATED}	Admin only	"CURRENT"	CURRENT: the relationship is the active authoritative trace result. SUPERSEDED: a newer Trace Tool commit has replaced this relationship with a different assignment for the same (entity, State, Asset) triple. INVALIDATED: the referenced entity or State has been removed from the SoI since this relationship was committed, making the relationship inconsistent with the current model.
TraceSessionID	String (uuid)	fixed (set on creation)	"N/A"	The uuid of the Trace Tool commit session that created this relationship version. Enables grouping of all changes committed in a single Trace Tool session.
Optional trace metadata properties (all three relationship types):
Property	Type	Edit	Default	Description
TraceNote	String	edit	"Null"	Optional analyst annotation explaining the rationale for this specific relationship assignment.
AcknowledgedInvalidation	Boolean	edit	False	When True, the analyst has acknowledged a TraceStatus = INVALIDATED condition and accepted it as a known state. Suppresses the finding from automated validation reports without changing TraceStatus.

Constraints on trace relationship properties:
TraceStateHID SHALL reference a (:State) node that belongs to the same SoI as the entity and the Asset.
TraceVersion SHALL be assigned by the Backend at commit time; the Frontend SHALL NOT set TraceVersion directly.
TraceStatus = SUPERSEDED SHALL be set only by the Backend during a Trace Tool commit transaction; it SHALL NOT be set directly by the User.
TraceStatus = INVALIDATED SHALL be set by the Backend when a node referenced by TraceStateHID or the entity node itself is removed from the SoI.
Only relationships with TraceStatus = CURRENT SHALL be used for Criticality and Assurance inheritance computation.
Only relationships with TraceStatus = CURRENT SHALL contribute to protection Requirement generation.
SUPERSEDED and INVALIDATED relationships SHALL be retained in the database for audit purposes and SHALL NOT be deleted by normal operations.
The Backend SHALL support a query returning all CURRENT entity-to-Asset relationships for a given entity, grouped by Asset, for use in criticality source computation.



##### 3.3.4.6.2 Criticality and Assurance Inheritance from Asset Relationships

When an entity ((:Interface), (:SystemFunction), or (:Component)) has one or more CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationships to (:Asset) nodes in the same SoI, the entity's Criticality and Assurance properties SHALL be computed as the logical OR-union of the corresponding properties across all such Assets.
Inheritance rules:
If any (:Asset) with a CURRENT relationship to the entity has SafetyCritical = True, the entity's SafetyCritical SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has MissionCritical = True, the entity's MissionCritical SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has FlightCritical = True, the entity's FlightCritical SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has SecurityCritical = True, the entity's SecurityCritical SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has Confidentiality = True, the entity's Confidentiality SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has Availability = True, the entity's Availability SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has Authenticity = True, the entity's Authenticity SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has NonRepudiation = True, the entity's NonRepudiation SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has Certifiable = True, the entity's Certifiable SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has Privacy = True, the entity's Privacy SHALL be True.
If any (:Asset) with a CURRENT relationship to the entity has Trustworthy = True, the entity's Trustworthy SHALL be True.
Level properties (SafetyLevel, MissionLevel, FlightLevel, SecurityLevel) SHALL be set to the maximum integer value across all contributing Assets for the corresponding Criticality dimension.  If no contributing Asset has a value set for a Level property, the Level property on the entity SHALL be Null.
Removal and recomputation:
When a CURRENT entity-to-Asset relationship is superseded or invalidated (reducing the set of Assets contributing to an entity's criticality), the entity's Criticality and Assurance properties SHALL be recomputed from the remaining CURRENT relationships to all Assets in the SoI.  This computation covers all Assets, not only the Asset whose relationship changed.
If an entity has no CURRENT relationships to any (:Asset), all Criticality and Assurance Boolean properties on the entity SHALL be set to False and all Level properties SHALL be set to Null.
Criticality and Assurance property values on entities that are derived through this inheritance rule SHALL NOT be manually overwritten by the User except when the entity has no CURRENT Asset relationships, in which case the User MAY set Criticality and Assurance properties directly.
Connection inheritance:
For each (:Connection) that an (:Interface) participates in via [:PARTICIPATES_IN], the (:Connection) node's Criticality and Assurance properties SHALL be computed as the OR-union of the corresponding properties across all (:Interface) nodes that participate in that (:Connection) and have at least one CURRENT entity-to-Asset relationship.
Connection Criticality and Assurance SHALL be recomputed whenever any participating (:Interface)'s Criticality or Assurance properties change as a result of Asset relationship changes.
Constraints:
Criticality and Assurance inheritance SHALL be computed and committed by the Backend as part of the Trace Tool commit transaction.
The Backend SHALL NOT allow a User to manually set a Criticality or Assurance property to False on an entity that has a CURRENT Asset relationship contributing that flag to True.
The Frontend SHALL display inherited Criticality and Assurance properties as computed/fixed when CURRENT Asset relationships exist, and as editable when no CURRENT Asset relationships exist.



##### 3.3.4.6.3 Protection Requirement Generation from Asset Relationships

When an entity ((:Interface), (:SystemFunction), or (:Component)) has one or more CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationships to an (:Asset), a protection (:Requirement) SHALL be generated for each Assurance property on that (:Asset) that is True.
Canonical Requirement text:

> `"{entity Name} SHALL protect the {Assurance label} of {Asset Name}."`
Where:
`{entity Name}` is the Name property of the entity node.
`{Assurance label}` is the human-readable display label of the Assurance property as defined in Section 3.3.10: Confidentiality, Availability, Authenticity, Non-Repudiation, Certifiable, Privacy, or Trustworthiness.
`{Asset Name}` is the Name property of the (:Asset) node.

Duplicate prevention:
Before creating a protection Requirement, the Backend SHALL check whether a (:Requirement) node with an RStatement exactly matching the canonical text above already exists on the entity via [:HAS_REQUIREMENT].  If one exists, no duplicate SHALL be created.  The existing Requirement is treated as current.

Relationship creation:
When a new protection Requirement is created, the Backend SHALL:
Create the (:Requirement) node with the canonical RStatement text, VMethod = Inspection, Orphan = False, Barren = True, Owner and Creator = current authenticated User, and HID per Section 3.3.8.
Create (entity)-[:HAS_REQUIREMENT]->(:Requirement).
Create (:Purpose)-[:HAS_REQUIREMENT]->(:Requirement) where (:Purpose) is the active SoI's (:Purpose) node.

Orphan detection:
A protection Requirement generated for Asset A on entity E is considered orphaned when entity E has no CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to Asset A.  The Backend SHALL set Orphan = True on the (:Requirement) node when this condition is detected during a Trace Tool commit.
Orphaned protection Requirements SHALL NOT be automatically deleted.  Deletion is an explicit User action.

Constraints:
Protection Requirement generation SHALL be executed as part of the Trace Tool commit transaction.
Protection Requirements generated by the Trace Tool are standard (:Requirement) nodes subject to all Core Data Model rules including [:HAS_REQUIREMENT] bearer authorization (Section 3.3.4.8) and requirement parentage rules (Section 3.3.4.7).
Protection Requirements are not distinguished by node label or type from other (:Requirement) nodes; they are identifiable by their canonical RStatement text pattern and their relationship to the entity and Asset.



#### 3.3.4.7 Purpose, Constraint, Requirement, Validation

(:Purpose)-[:HAS_CONSTRAINT]->(:Constraint)
(:Purpose)-[:HAS_REQUIREMENT]->(:Requirement)
(:Purpose)-[:HAS_VALIDATION]->(:Validation)
(:Purpose)-[:HAS_USECASE]->(:UseCase)

(:UseCase)-[:INCLUDES]->(:SystemFunction)
(:UseCase)-[:INVOLVES]->(:Interface)
(:UseCase)-[:EXTENDS]->(:UseCase)
(:UseCase)-[:INCLUDES_UC]->(:UseCase)



(:Constraint)-[:HAS_REQUIREMENT]->(:Requirement)

(:Requirement)-[:PARENTS]->(:Requirement)
(:Requirement)-[:VERIFIED_BY]->(:Verification)

Constraints:

* A (:UseCase) SHALL be owned by exactly one (:Purpose) node via [:HAS].
* A (:Purpose) MAY have zero or more (:UseCase) nodes.
* A (:UseCase) MAY include zero or more (:SystemFunction) nodes via [:INCLUDES].
* A (:UseCase) MAY involve zero or more (:Interface) nodes via [:INVOLVES].
* (:SystemFunction) and (:Interface) nodes associated to a (:UseCase) SHALL belong to the same SoI as the owning (:Purpose).
* [:INCLUDES] (UseCase-to-Function participation) SHALL NOT be confused with
the SysML 2.0 include-use-case relationship between Use Cases; the
inter-UseCase include is modeled by [:INCLUDES_UC] and translates to a SysML
2.0 IncludeUseCaseUsage (keyword: include use case).
* SysML 2.0 does not define a use-case extend relationship. [:EXTENDS] is an
SSTPA modeling relationship. It SHALL translate to a SysML 2.0 use case
specialization annotated with the SSTPA Profile metadata keyword #extend,
carrying ExtensionPoint as a metadata attribute (Section 3.7.6). The «extend»
adornment used in diagrams is an SSTPA display convention, not a SysML 2.0
notation.

* [:EXTENDS] and [:INCLUDES_UC] SHALL form a DAG; cycles are prohibited.
* Requirements SHALL NOT be related directly to (:UseCase).  All (:Requirement) nodes derived from Use Case analysis SHALL be owned by the (:SystemFunction) or (:Interface) participating in the (:UseCase) via [:HAS_REQUIREMENT].


* (:Requirement)-[:PARENTS]->(:Requirement) SHALL form a Directed Acyclic Graph.
* Requirement parentage MAY cross SoI boundaries only where allowed by Requirements Tool rules.
* Duplicate parentage edges SHALL NOT exist.
* Requirements allocated only to (:Purpose) SHALL be treated as unallocated for gap-analysis purposes unless explicitly exempted.
* Analytical properties on (:Requirement): Orphan = True when the Requirement
has no bearer other than (:Purpose); Barren = True when the Requirement has
no child Requirement via [:PARENTS] and no [:VERIFIED_BY] relationship.
Both are computed by the Backend.


#### 3.3.4.8 Requirement-Bearing Nodes

The following nodes SHALL be authorized to own direct [:HAS_REQUIREMENT] relationships:



(:Project)-[:HAS_REQUIREMENT]->(:Requirement)
(:Purpose)-[:HAS_REQUIREMENT]->(:Requirement)
(:Connection)-[:HAS_REQUIREMENT]->(:Requirement)
(:Interface)-[:HAS_REQUIREMENT]->(:Requirement)
(:SystemFunction)-[:HAS_REQUIREMENT]->(:Requirement)
(:Component)-[:HAS_REQUIREMENT]->(:Requirement)
(:Constraint)-[:HAS_REQUIREMENT]->(:Requirement)
(:Countermeasure)-[:HAS_REQUIREMENT]->(:Requirement)

(:SecurityControl)-[:HAS_REQUIREMENT]->(:Requirement)


When a new (:System) is created from another (:System) (:Component) all (:Requirement) nodes related to that (:Component) SHALL be cloned into new (:Requirement) nodes under the default (:Purpose) node.

No other node type SHALL create [:HAS_REQUIREMENT] relationships unless explicitly authorized by a later version of this SRS.


#### 3.3.4.9 Security, Controls, Countermeasures

(:System)-[:HAS_PERSPECTIVE]->(:Perspective)
(:Perspective)-[:HAS_SECURITY]->(:Security)
(:Security)-[:HAS_CONTROL]->(:SecurityControl)
(:Security)-[:HAS_COUNTERMEASURE]->(:Countermeasure)

(:SecurityControl)-[:ENFORCES]->(:Constraint)
(:SecurityControl)-[:MITIGATES]->(:Hazard)



(:Countermeasure)-[:SATISFIES]->(:SecurityControl)
(:Countermeasure)-[:HAS_REQUIREMENT]->(:Requirement)
(:Countermeasure)-[:APPLIES_TO_FUNCTION]->(:SystemFunction)
(:Countermeasure)-[:APPLIES_TO_INTERFACE]->(:Interface)
(:Countermeasure)-[:APPLIES_TO_ELEMENT]->(:Component)
(:Countermeasure)-[:APPLIES_TO_STATE]->(:State)
(:Countermeasure)-[:APPLIES_TO_FEEDBACK]->(:Feedback)
(:Countermeasure)-[:BLOCKS]->(:Attack)



Constraints:



* (:SecurityControl) SHALL represent abstract assurance intent.
* (:Countermeasure) SHALL represent concrete implementation or design response.
* Requirements SHALL realize Countermeasures.
* Verification SHALL verify Requirements.
* Countermeasure-driven state behavior SHALL be represented by properties on [:TRANSITIONS_TO], not by creating a transition node.
* [:APPLIES_TO_STATE] identifies affected State nodes but SHALL NOT replace [:TRANSITIONS_TO].



#### 3.3.4.10 Hazard and Attack

Hazard is a component of the Environment outside the System.  The Attack is a projection of the Hazard into the System.  Attacks operate on Elements, Interfaces, Functions and Countermeasures.  Attacks can be subordinated to show  the attack procedures associated with an Attack tactic. Attack is related to Loss in part for validity checking.



(:Hazard)-[:VIOLATES]->(:Constraint)
(:Hazard)-[:THREATENS]->(:Asset)
(:Hazard)-[:USES_ATTACK]->(:Attack)

(:Attack)-[:SUBORDINATE_TO]->(:Attack)

(:Attack)-[:EXPLOITS]->(:Component)
(:Attack)-[:EXPLOITS]->(:Interface)
(:Attack)-[:EXPLOITS]->(:SystemFunction)



(:Attack)-[:DEFEATS]->(:Countermeasure)
(:Attack)-[:TARGETS_LOSS]->(:Loss)



Constraints:

* Hazard SHALL represent a threatening condition.
* Attack SHALL represent an action or exploit path.
* Attack MAY terminate a Loss attack-tree branch as a residual vulnerability.
* Hazard and Attack SHALL remain separate node types.
* [:EXPLOITS] SHALL relate an (:Attack) to the (:Component), (:Interface), or
(:SystemFunction) it acts upon. An (:Attack) SHALL have at least one [:EXPLOITS]
relationship before it can appear in an Attack Tree.
* [:SUBORDINATE_TO] models the hierarchical relationship between a general
Attack (Strategy or Tactic level) and a more specific Attack (Procedure level).
A subordinate (:Attack) represents a concrete implementation of its parent
Attack. The [:SUBORDINATE_TO] relationship SHALL be acyclic (see Section 3.3.6).
* A subordinate (:Attack) MAY itself have subordinate (:Attack) children,
allowing a three-level hierarchy: Strategy → Tactic → Procedure, consistent
with the MITRE ATT\&CK framework levels.
* [:TARGETS_LOSS] records the analytical scoping of an (:Attack) to a specific
(:Loss) context. It is optional and used when a User creates an Attack that is
relevant only to a specific Loss scenario rather than generally applicable.
An (:Attack) without [:TARGETS_LOSS] is considered generally applicable to all
relevant entity-Asset combinations in the SoI.
* [:DEFEATS] models an Attack that overcomes a specific (:Countermeasure).
(:Attack)-[:DEFEATS]->(:Countermeasure) is the semantic inverse of
(:Countermeasure)-[:BLOCKS]->(:Attack). Both SHALL exist independently;
neither replaces the other.



#### 3.3.4.11 Asset, Regime, Loss, and GSN Goal

This section describes relationships for Asset.  These are used in Tools to develop analytical products.

(:System)-[:HAS_ASSET]->(:Asset)
(:Asset)-[:HAS_REGIME]->(:Regime)
(:Asset)-[:HAS_LOSS]->(:Loss)
(:Asset)-[:HAS_GOAL]->(:GsnGoal)


(:Loss)-[:HAS_ENVIRONMENT]->(:Environment)



Attack Tree participation by (:State), (:Component), (:Interface),
(:SystemFunction), (:Attack), and (:Countermeasure) is expressed through
[:AT_RELATES_TO] relationships carrying LossHID, which scope each relationship
to its owning Loss.

(:Loss)-[:AT_RELATES_TO]->(:Environment)
(:Loss)-[:AT_RELATES_TO]->(:State)
(:State)-[:AT_RELATES_TO]->(:Interface)
(:State)-[:AT_RELATES_TO]->(:SystemFunction)
(:State)-[:AT_RELATES_TO]->(:Component)
(:Interface)-[:AT_RELATES_TO]->(:Attack)
(:SystemFunction)-[:AT_RELATES_TO]->(:Attack)
(:Component)-[:AT_RELATES_TO]->(:Attack)
(:Attack)-[:AT_RELATES_TO]->(:Attack)
(:Attack)-[:AT_RELATES_TO]->(:Countermeasure)
(:Countermeasure)-[:AT_RELATES_TO]->(:Attack)
(:Countermeasure)-[:AT_RELATES_TO]->(:Asset)



**[:AT_RELATES_TO] Relationship Properties**

The `[:AT_RELATES_TO]` relationship is used exclusively within Attack Trees.
It SHALL carry the following properties on the relationship edge.

**Required properties:**

|Property|Type|Edit|Default|Description|
|-|-|-|-|-|
|LossHID|String|fixed (system)|N/A|HID of the (:Loss) node that owns this attack tree edge. Set on creation; immutable. Scopes the relationship to exactly one tree.|
|Lossuuid|String|fixed (system)|N/A|uuid of the owning (:Loss) node. Redundant with LossHID for query performance.|
|LogicOperator|Enum {AND, OR, SAND}|edit|AND|The logical operator governing how this child node's condition combines with sibling nodes under the same parent. AND: all siblings must be satisfied. OR: any one sibling is sufficient. SAND: siblings must be satisfied in SANDSequence order.|
|SANDSequence|Integer|edit|Null|For LogicOperator = SAND: the ordinal position of this child among its SAND siblings (0-indexed). NULL for AND and OR.|



**Optional properties:**

|Property|Type|Edit|Default|Description|
|-|-|-|-|-|
|TailoredOut|Boolean|edit|False|When True, this edge is excluded from path enumeration and metric propagation for the owning Loss. Requires non-null TailorReason.|
|TailorReason|String|edit|Null|Mandatory when TailoredOut = True. Analyst explanation of why this relationship does not apply in the current Loss context.|
|CompleteBlock|Boolean|edit|False|Applicable only when target is (:Countermeasure) and source is (:Attack). When True, the Countermeasure completely blocks the Attack with no recourse by the threat actor. Requires non-null CompleteBlockReason.|
|CompleteBlockReason|String|edit|Null|Mandatory when CompleteBlock = True. Justification that this Countermeasure is an absolute barrier.|
|AllowedRV|Boolean|edit|False|Applicable only when source is (:Attack) and the edge is terminal (leaf Attack with no outgoing AT_RELATES_TO to a Countermeasure). When True, this Residual Vulnerability has been reviewed and accepted. Requires non-null AllowedRVReason.|
|AllowedRVReason|String|edit|Null|Mandatory when AllowedRV = True. Analyst rationale for accepting this Residual Vulnerability.|
|MetricCacheJSON|String (serialized JSON)|fixed (system)|Null|Backend-computed cache of all metric values propagated through this edge. Updated on every tree recalculation Commit. Format: `{"MetricName": value, ...}`.|

\---



Constraints:

* (:Asset)-[:HAS_REGIME]->(:Regime) SHALL replace any use of [:HAS] or [:Has]
for Regime.
* (:Asset)-[:HAS_GOAL]->(:GsnGoal) SHALL replace generic [:HAS] relationships to
GSN Goal nodes.
* Each (:Loss) SHALL be associated with exactly one (:Environment) via
[:HAS_ENVIRONMENT].
* Each (:Loss) SHALL be associated with exactly one (:Asset) through the inverse
path (:Asset)-[:HAS_LOSS]->(:Loss).
* Each (:Loss) SHALL have exactly one true Criticality property and exactly one
true Assurance property.
* [:AT_RELATES_TO] relationships SHALL be scoped to a single Attack Tree by
LossHID. The same entity node (e.g. a (:State) or (:Attack)) MAY participate
in multiple Attack Trees across different (:Loss) nodes without conflict,
because each participation is identified by a distinct LossHID on the edge.
* [:AT_RELATES_TO] SHALL NOT create cycles. The resulting graph of all
[:AT_RELATES_TO] edges sharing the same LossHID SHALL form a Directed Acyclic
Graph (DAG) rooted at the (:Loss) node.
* The (:Loss) node is the unique root of its Attack Tree. (:Loss) SHALL NOT
appear as the target of any [:AT_RELATES_TO] relationship within its own tree.
* SANDSequence SHALL be Null when LogicOperator = AND or OR. SANDSequence SHALL
be a non-negative integer when LogicOperator = SAND. SANDSequence values among
SAND siblings of the same parent SHALL be unique.

* All [:AT_RELATES_TO] edges that share the same source node and the same
LossHID, excluding edges with TailoredOut = True, SHALL carry the same
LogicOperator value. The shared value is the gate of that parent node within
that Loss's Attack Tree. The Backend SHALL reject a Commit that would violate
gate consistency.
* When LogicOperator = SAND, SANDSequence values SHALL be unique and
contiguous from 0 among the non-TailoredOut sibling edges.
* The KerML 1.0 representation of Attack Tree structure is specified in
Section 3.7.6; the gate maps to the profile association AtAnd, AtOr, or
AtSand, with SAND ordering additionally expressed by KerML succession.


* TailoredOut = True requires non-null TailorReason before Commit.
* CompleteBlock = True requires non-null CompleteBlockReason before Commit.
* AllowedRV = True requires non-null AllowedRVReason before Commit.
* [:AT_RELATES_TO] edges are created and managed exclusively by the Loss Tool.
No other Add-on Tool or GUI operation SHALL create, modify, or delete
[:AT_RELATES_TO] edges.
* The Backend SHALL validate LossHID against the actual (:Loss) node HID on
every [:AT_RELATES_TO] create or update operation.
* [:HAS_ELEMENT], [:HAS_STATE], [:HAS_ATTACK], and [:HAS_COUNTERMEASURE]
relationships originating from (:Loss) are retired. The Backend SHALL reject
creation of these relationship types from a (:Loss) source node.

Loss analysis DAGs SHALL be represented by [:AT_RELATES_TO] graph relationships
with layout persisted in AttackTreeJSON. AttackTreeJSON SHALL NOT be the
authoritative source for Attack Tree structure; the graph IS the authoritative
source.

#### 3.3.4.12 STPA Control Structure

SSTPA Control Structure is a construct under (:Perspective).


(:System)-[:HAS_PERSPECTIVE]->(:Perspective)
(:Perspective)-[:HAS_CONTROL_STRUCTURE]->(:ControlStructure)

Note: (:Purpose)-[:HAS_CONTROL_STRUCTURE]->(:ControlStructure) (Section
3.3.3.1) records which Purpose motivates the Control Structure; the
Perspective chain records its containment. Both relationships are permitted
on the same (:ControlStructure).


(:ControlStructure)-[:HAS_CONTROL_ALGORITHM]->(:ControlAlgorithm)
(:ControlStructure)-[:HAS_PROCESS_MODEL]->(:ProcessModel)
(:ControlStructure)-[:HAS_CONTROLLED_PROCESS]->(:ControlledProcess)
(:ControlStructure)-[:HAS_CONTROL_ACTION]->(:ControlAction)
(:ControlStructure)-[:HAS_FEEDBACK]->(:Feedback)

(:Interface)-[:IMPLEMENTS]->(:ControlAlgorithm)
(:Interface)-[:IMPLEMENTS]->(:ControlledProcess)

(:SystemFunction)-[:IMPLEMENTS]->(:ControlAlgorithm)
(:SystemFunction)-[:IMPLEMENTS]->(:ControlledProcess)
(:SystemFunction)-[:IMPLEMENTS]->(:ProcessModel)

(:ControlAlgorithm)-[:GENERATES]->(:ControlAction)
(:ControlAction)-[:COMMANDS]->(:ControlledProcess)
(:ControlAction)-[:CAUSES]->(:Hazard)
(:ControlledProcess)-[:PRODUCES]->(:Feedback)

(:Feedback)-[:INFORMS]->(:ProcessModel)

(:ProcessModel)-[:TUNES]->(:ControlAlgorithm)


Constraints:


* A single (:SystemFunction) SHALL have no more than one [:IMPLEMENTS] relationship into an STPA role node.
* A single (:Interface) SHALL have no more than one [:IMPLEMENTS] relationship into an STPA role node.
* Control-loop relationships MAY form bounded analytical cycles.
* Control-loop traversal SHALL be bounded.



#### 3.3.4.13 GSN Assurance Case



(:GsnGoal)-[:SUPPORTED_BY]->(:GsnGoal)

(:GsnGoal)-[:SUPPORTED_BY]->(:GsnStrategy)

(:GsnGoal)-[:SUPPORTED_BY]->(:GsnSolution)



(:GsnGoal)-[:IN_CONTEXT_OF]->(:GsnContext)

(:GsnGoal)-[:IN_CONTEXT_OF]->(:GsnJustification)

(:GsnGoal)-[:IN_CONTEXT_OF]->(:GsnAssumption)



(:GsnStrategy)-[:IN_CONTEXT_OF]->(:GsnContext)

(:GsnStrategy)-[:IN_CONTEXT_OF]->(:GsnJustification)

(:GsnStrategy)-[:IN_CONTEXT_OF]->(:GsnAssumption)



(:GsnContext)-[:HAS_ENVIRONMENT]->(:Environment)



(:GsnSolution)-[:HAS_VALIDATION]->(:Validation)

(:GsnSolution)-[:HAS_VERIFICATION]->(:Verification)

(:GsnSolution)-[:HAS_LOSS]->(:Loss)



Constraints:



* GSN relationships SHALL use Neo4j relationship syntax.
* Generic [:HAS] relationships SHALL NOT be used where a semantic relationship exists.
* [:SUPPORTED_BY] relationships SHALL form a DAG unless a future version explicitly authorizes cyclic assurance-case structures.



---



### 3.3.5 Canonical Cross-SoI Relationship Rules


The following relationships MAY cross SoI boundaries when validated by the Backend:

* (:Interface)-[:PARTICIPATES_IN]->(:Connection)
* (:Requirement)-[:PARENTS]->(:Requirement)

The following relationships SHALL NOT cross SoI boundaries unless explicitly justified and recorded as an analytical exception:

* (:State)-[:TRANSITIONS_TO]->(:State)
* (:SystemFunction)-[:FLOWS_TO_FUNCTION]->(:SystemFunction)
* (:SystemFunction)-[:FLOWS_TO_INTERFACE]->(:Interface)
* (:SystemFunction)-[:HOLDS]->(:Asset)
* (:SystemFunction)-[:TRANSPORTS]->(:Asset)
* (:SystemFunction)-[:USES]->(:Asset)
* (:Interface)-[:HOLDS]->(:Asset)
* (:Interface)-[:TRANSPORTS]->(:Asset)
* (:Interface)-[:USES]->(:Asset)
* (:Component)-[:HOLDS]->(:Asset)
* (:Component)-[:TRANSPORTS]->(:Asset)
* (:Component)-[:USES]->(:Asset)
* (:State)-[:HOLDS]->(:Asset)
* (:State)-[:TRANSPORTS]->(:Asset)
* (:State)-[:USES]->(:Asset)

> All entity-to-Asset trace relationships are scoped to the SoI of the entity and the Asset.  The Asset referenced in a trace relationship SHALL belong to the same SoI as the entity, established through (:System)-[:HAS_ASSET]->(:Asset).  Cross-SoI Asset trace relationships are not supported in this version.



* (:Countermeasure)-[:APPLIES_TO_STATE]->(:State)
* (:Countermeasure)-[:APPLIES_TO_FUNCTION]->(:SystemFunction)
* (:Countermeasure)-[:APPLIES_TO_INTERFACE]->(:Interface)
* (:Countermeasure)-[:APPLIES_TO_ELEMENT]->(:Component) 
* (:State)-[:VALID_IN]->(:Environment) — both nodes SHALL belong to the same SoI
* (any)-[:AT_RELATES_TO]->(any) — all Attack Tree relationships SHALL be
scoped to the SoI of the owning (:Loss); the LossHID property SHALL match
a (:Loss) node belonging to the same SoI as all participating entity nodes
* (:Purpose)-[:HAS_USECASE]->(:UseCase)
* (:UseCase)-[:INCLUDES]->(:SystemFunction)
* (:UseCase)-[:INVOLVES]->(:Interface)
(:UseCase) nodes are scoped to the SoI of their owning (:Purpose).  All (:SystemFunction) and (:Interface) nodes associated via [:INCLUDES] and [:INVOLVES] SHALL belong to the same SoI.  Cross-SoI Use Case analysis is not supported in this version.
The Backend SHALL reject unauthorized cross-SoI relationships.

---

### 3.3.6 Canonical Recursive Relationship Governance

The following relationships SHALL be acyclic:

* (:Component)-[:PARENTS]->(:System)
* (:Requirement)-[:PARENTS]->(:Requirement)
* (:GsnGoal)-[:SUPPORTED_BY]->(:GsnGoal), unless explicitly extended
* [:AT_RELATES_TO] (all Attack Tree edges sharing the same LossHID SHALL form
a DAG; the Backend SHALL reject any edge that would create a cycle within
the tree identified by that LossHID)
* (:Attack)-[:SUBORDINATE_TO]->(:Attack) (Attack hierarchy SHALL be acyclic;
a Procedure SHALL NOT be an ancestor of its own Strategy or Tactic)
* (:UseCase)-[:EXTENDS]->(:UseCase)
* (:UseCase)-[:INCLUDES_UC]->(:UseCase)

The following relationships SHALL be cyclic-by-design and bounded:

* (:State)-[:TRANSITIONS_TO]->(:State)
* (:SystemFunction)-[:FLOWS_TO_FUNCTION]->(:SystemFunction)
* Control-loop relationships involving ControlAlgorithm, ControlAction, ControlledProcess, Feedback, and ProcessModel

The Backend SHALL enforce the declared recursive behavior.
All recursive traversal SHALL require a maximum depth parameter.
The Backend SHALL provide safe default maximum depths for all recursive traversals.


### 3.3.7 System Creation Behavior

When an (:System) is created from an (:Component) through the relationship: (:Component)-[:PARENTS]->(:System) the following behaviors SHALL occur:

* (:System) is created with a new HID
* One of each  (:Purpose), (:Environment) and (:State) node with default properties are created and related to the new (:System)
* All (:Requirement) nodes related to the parent (:Component) or related to a (:SystemFunction) or an (:Interface) related to the parent (:Component) are copied to a new (:Requirement) under the new (:System) (:Purpose) node with the same properties excepting HID and uuid which is modified to reflect the new (:System).
* All (:Asset) nodes related to the parent (:Component), or related to a (:SystemFunction) or an (:Interface) associated with the parent (:Component) via CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationships, SHALL be copied to new (:Asset) nodes in the new SoI with the same properties, excepting HID and uuid which SHALL be recomputed to reflect the new (:System).  The entity-to-Asset [:HOLDS], [:TRANSPORTS], and [:USES] relationships from the parent entity SHALL NOT be copied to the new SoI; trace analysis for the new SoI SHALL be performed independently using the Trace Tool.
* New (:Loss) and (:GsnGoal) nodes are created based on the new (:Asset) nodes



\---





### 3.3.8 Identity Model (HID + UUID)

Each node SHALL contain:

HID (Hierarchical Identifier)

uuid (Globally unique identifier)



HID Format

{TYPE}*{INDEX}*{SEQUENCE}



Example:

SYS_1.2.3_0

UUID Property

uuid: apoc.create.uuid()





* 

#### 3.3.8.1 Node Type Identifier

The Node Identifier uniquely identifies each Node Type.  In STPA analysis it is common to identify nodes with a letter and a number.  Each Node type in the SSTPA Tool SHALL have a unique one, two or three character identifier as listed below in the format {Node Type} {Node Type Identifier}:

Capability CAP
Sandbox SB
System SYS
Environment ENV
Connection CNN
Interface INT
SystemFunction FUN
Component EL
Purpose PUR
State ST
ControlStructure CS
Asset AST
Constraint CST
Requirement REQ
Validation VAL
SecurityControl CTRL
Countermeasure CM
Verification VER
ControlAlgorithm CAL
ProcessModel PM
ControlAction ACT
Feedback FB
ControlledProcess CP
Hazard HAZ

ControlsBaseline CBL
Loss LOS
Attack ATK
Regime REG
GsnGoa G
GsnStrategy SGY
GsnContext CX
Assumption ASM
GsnJustification JUS
GsnSolution SOL
UseCase UC


Perspective PRS
Security SEC
FunctionalFlow FF
DerivedAsset DA



#### 3.3.8.2  Index

The index uniquely identifies the Sub-graph a Node belongs to and is constructed to depict its position in the entire hierarchy.

The Index will be unique for each sub-graph and every node in the sub-graph will have the same Index.
The Index for the Capability SHALL be null as the data set only contains one capability whose only purpose is to attach tier 1 systems.

When a node is created it SHALL inherit the Index of the sub-graph it belongs to excepting (:System) nodes.

When a (:System) is created as a child of a capability the index SHALL be calculated as the next highest integer value of other System children unless there are no other System children then it gets an index of "1".

When a System is created as the child of an Element its Index SHALL be the index of the Parent Element concatenated with "." concatenated with the (:Component) Node HID Sequence Number property.  For example if an (:Component) has an HID of EL_1.2.3_4 than its child (:System) will have an HID of SYS_1.2.3.4_0.

(:Component) Nodes SHALL have zero or one child (:System) nodes and this constraint will be enforced by Frontend Software.  The Relationship between an (:Component) node and its single (:System) node is:
(:Component)--[:PARENTS]-->(:System)

Note, The (:System) related to here is in a child sub-graph where the new System HID index is set to the concatenation of the (:Component) Index with the (:Component) Sequence Number.


##### 3.3.8.2.1 Index Strategy

The Backend SHALL create the following indexes:

CREATE INDEX node_hid_index IF NOT EXISTS FOR (n) ON (n.HID);
CREATE INDEX node_uuid_index IF NOT EXISTS FOR (n) ON (n.uuid);
CREATE INDEX node_name_index IF NOT EXISTS FOR (n) ON (n.Name);
CREATE INDEX node_type_index IF NOT EXISTS FOR (n) ON (n.TypeName);


#### 3.3.8.3 Sequence Number

The Sequence Number is intended to distinguish nodes of the same type within the same SoI sub-graph.
The Sequence Number for a System SHALL be "0" because there is only one System in the SoI sub-Graph.
The Sequence Number for a Node other than a System Node SHALL be next highest integer value of other nodes of the same node type in the sub-graph unless there are no others of that node type in the sub-graph, then it is the first and its value is "1".





### 3.3.9 Common Property Groups

This section serves to both define the core data model and define how those properties should be displayed.  This is done for consistency across representations.  The progressive disclosure pattern will be:



Node Type-->Node-->Property Groups-->Properties



When Node Type is displayed, under it will be the integer number of nodes of that type.  If other than (0) than when user toggles it will progressively disclose vertically the specific nodes showing HID and Name properties.  below each Node will be the word "Property Groups"  When toggled by the user this progressively discloses all property groups associated with the node starting with the two common property groups.  When a Property Group name is toggled by the user, properties within that group are displayed and can, if allowed be edited.



For clarity, properties are organized in "Property Groups". in the GUI following the progressive disclosure pattern, when a specific node is progressively revealed there will be a single carrot below it with the word "Properties".  when toggled by the user the GUI will reveal the Property Groups associated with the specific node type.  First displayed will be Property Groups common to all Nodes and Relationships  These common Property Groups are "ID:" and "Description"  These are described below with their specific properties.



The format used to specify Property Groups and Properties will be:

Property Group Name:

Property "Display Name for Property" Data_Type, editability, default: ""



Property Group listings may be followed by a statement addressing constraints on those properties.



The "Property Group Name" is what is progressively disclosed when the user toggles "Property Groups" and when it is toggled, will progressively disclose its properties.

"Property" is the property name maintained by the backend on that specific node

"Display Name" is what the GUI or add-on tool displays to the user as the property name.

Data_Type is the data type used by the backend and frontend to represent the property.   Note, where possible, Boolean types will be represented by check boxes rather than "True" / "False"

Editability is direction to the front end to allow the non-privileged user to edit the property.  "edit"=yes, "fixed"=no.  some properties are fixed on creation while others are "fixed" when an analytical report is run.  Some "fixed" properties may be editable only if the current user is "Admin".

":Default: """ indicates what is between the "" is to be used as the default property value on node creation cast to the correct property type. when default is "Null" value is null, when value is "N/A" the Frontend must enforce a specific property value at time of creation and there is no default value (e.g. property "uuid" has default: "N/A" because a unique identifier is assigned at creation).



Property Groups are not node properties and only for organizing the display of properties and SHALL be enforced by the Frontend.

Property types SHALL be enforced by both the Frontend and the Backend.

Property defaults and ability to edit SHALL be enforced by the Frontend.

* 

Common Property Groups:



ID:

Name "Name:" String edit default: "New"

HID "Hierarchical Identifier: " Structure fixed default: "N/A"

uuid "UUID: " String fixed default: "N/A"

TypeName "Node Type Name " String fixed default: "N/A"

Owner "Data Owner: " String fixed default: "N/A"

OwnerEmail "Owner Email " String fixed default: "N/A"

Creator "Creator: " String fixed default: "N/A"

CreatorEmail "Creator Email: " String fixed default: "N/A"

Created "Created: " datetime fixed default: "N/A"

LastTouch "Last Touch: " datetime() fixed default: "N/A"

VersionID "Data Schema Version:  " String fixed default: "N/A"



Description:

ShortDescription "Short Description: " String fixed default: "Null"

LongDescription "Full Description:" String fixed default: "Null"



#### 3.3.9.1 Data Ownership Rules

Every node SHALL have exactly one Owner and one Creator.

On creation of any node, Creator, CreatorEmail, Owner, and OwnerEmail SHALL be assigned to the current authenticated user.

Created SHALL be set to the current timestamp on creation.

LastTouch SHALL be set to the current timestamp on creation and on every committed modification to that node.

Creator and CreatorEmail SHALL be immutable after node creation except when current user is Admin.

Owner and OwnerEmail SHALL be editable such that the current user can assume ownership only.  If current user is Admin ownership assignment may be to any registered user.

Owner and OwnerEmail if changed are always changed as a pair from backend (:User) node properties.



Ownership change SHALL be treated as a node modification for notification purposes.

Relationship changes involving a node SHALL be treated as changes to that node for notification purposes.

For a relationship between two existing nodes with different owners, the change SHALL be considered to affect both endpoint nodes.

If the current user commits a change to a node or relationship and the current user is not the Owner of the affected node, the system SHALL generate a message to the Owner’s mailbox describing the change.

Message generation SHALL occur within the same transaction as the committed data change.

Failure to create required ownership-notification messages SHALL cause the overall commit transaction to fail.





### 3.3.10 Type Unique Property and Relationship Groups

Each Node type will have, in addition, not common properties and relationship groups unique to its type.

Formatting rules from 1.3.7 apply here.

Headings below are Node Type names to which the unique Property Groups and Properties apply.



For node types authorized in Section 1.3.10.4 to assign imported external references by [:REFERENCES], Section 1.3.8 SHALL define property groups used to capture node-local interpretation, applicability, implementation, evidence, and analysis specific to that node. These properties SHALL NOT duplicate or overwrite authoritative imported reference item properties. Imported reference item content remains read-only and authoritative. Node-local external reference properties apply only to the SSTPA node and may differ between nodes referencing the same imported item.



#### 3.3.10.1 Capability

Mission:
MissionAction "A Capability To:" String edit default: "Null"        (3.3.10.1)
MissionAction "A System To:" String edit default: "Null"            (3.3.10.2)
MissionMeans "By Means Of:" String edit default: "Null"
MissionContribution "In Order To Contribute To:" String edit default: "Null"




#### 3.3.10.2 System

Mission:
MissionAction "A Capability To:" String edit default: "Null"        (3.3.10.1)
MissionAction "A System To:" String edit default: "Null"            (3.3.10.2)
MissionMeans "By Means Of:" String edit default: "Null"
MissionContribution "In Order To Contribute To:" String edit default: "Null"


#### 3.3.10.3 Environment



Context:

Context "Context" String edit default: "Null"



#### 3.3.10.4  Connection

Reason:

Connection_Description "Rational:" String edit default: "Null"



Properties:

ConnectionType "Connection Type: " String edit default: "Null"

OSILayer "OSI Layer: " integer edit default: "Null"

Protocol: "Protocol: "String edit default: "Null"

Directionality "Directionality: " Enum {Unidirectional, Bidirectional, Multicast, Null} edit default: "Null"

TimingClass "Timing Class: " String (default "Null") edit default: "Null"

SecurityClass "Security Classification: " String (default "Null") edit default: "Null"

PayloadDescription "Payload Description" String (default "Null")



Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  " string edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  " string edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description:  " string edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  " string edit default "Null"



Assurances:

Confidentiality "Confidentiality" Boolean edit default: "False"

Availability  "Availability" Boolean edit default: "False"

Authenticity  "Authenticity" Boolean edit default: "False"

NonRepudiation "Non-Repudiation" Boolean edit default: "False"

Certifiable  "Certifiable" Boolean edit default: "False"

Privacy "Privacy" Boolean edit default: "False"

Trustworthy "Trust" Boolean edit default: "False"





#### 3.3.10.5  Interface

Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  "string edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  "string edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description:  " string edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  "string edit default "Null"



Assurances:

Confidentiality "Confidentiality" Boolean edit default: "False"

Availability  "Availability" Boolean edit default: "False"

Authenticity  "Authenticity" Boolean edit default: "False"

NonRepudiation "Non-Repudiation" Boolean edit default: "False"

Certifiable  "Certifiable" Boolean edit default: "False"

Privacy "Privacy" Boolean edit default: "False"

Trustworthy "Trust" Boolean edit default: "False"

Inheritance Note:
When a CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to any (:Asset) exists for this (:Interface), all Criticality and Assurance Boolean properties are computed by the Backend per Section 3.3.4.6.2 and are fixed (not directly editable by the User). When no such CURRENT relationships exist, these properties are directly editable.



#### 3.3.10.5.1  Interface Outgoing Relationship Properties

Only outgoing relationships with properties are identified here.



[:PARTICIPATES_IN] and [:CONNECTS] SHALL have hte following properties:

RelationshipNature "Nature:" Enum {PHYSICAL, LOGICAL, BOTH} edit default: "LOGICAL"

PhysicalType "Physical Type:" String edit default: "Null"

Example: universal joint, shaft, hydraulic linkage

LogicalLayer "OSI Layer:" Enum{N/A, Layer 1: Physical, Layer2: Data Link, Layer 3: Network, Layer 4: Transport, Layer 5 Session, Layer 6: Presentation, Layer 7: Application} edit default: "Null"

Protocol "Protocol:" String edit default: "Null"

FlowDirectionality "Directionality:" Enum {Unidirectional, Bidirectional, Multicast} edit default: "Unidirectional"

TimingClass "Timing Class:" String edit default: "Null"

SecurityClass "Security Classification:" String edit default: "Null"







#### 3.3.10.6 Function

Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  " edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  " edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description:  " edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  " edit default "Null"



Assurances:

Confidentiality "Confidentiality" Boolean edit default: "False"

Availability  "Availability" Boolean edit default: "False"

Authenticity  "Authenticity" Boolean edit default: "False"

NonRepudiation "Non-Repudiation" Boolean edit default: "False"

Certifiable  "Certifiable" Boolean edit default: "False"

Privacy "Privacy" Boolean edit default: "False"

Trustworthy "Trust" Boolean edit default: "False"
Inheritance Note:
When a CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to any (:Asset) exists for this (:SystemFunction), all Criticality and Assurance Boolean properties are computed by the Backend per Section 3.3.4.6.2 and are fixed (not directly editable by the User). When no such CURRENT relationships exist, these properties are directly editable.



#### 3.3.10.6.1  Function Outgoing Relationship Properties

Only outgoing relationships with properties are identified here.



[:FLOWS_TO_FUNCTION] and [:FLOWS_TO_INTERFACE] SHALLhave the following properties:

RelationshipNature "Nature:" Enum {PHYSICAL, LOGICAL, BOTH} edit default: "LOGICAL"

PhysicalType "Physical Type:" String edit default: "Null"

Example: universal joint, shaft, hydraulic linkage

LogicalLayer "OSI Layer:" Enum{N/A, Layer 1: Physical, Layer2: Data Link, Layer 3: Network, Layer 4: Transport, Layer 5 Session, Layer 6: Presentation, Layer 7: Application} edit default: "Null"

Protocol "Protocol:" String edit default: "Null"

FlowDirectionality "Directionality:" Enum {Unidirectional, Bidirectional, Multicast} edit default: "Unidirectional"

TimingClass "Timing Class:" String edit default: "Null"

SecurityClass "Security Classification:" String edit default: "Null"





#### 3.3.10.7 Element



Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  " string edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  " string edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description:  " string edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  " string edit default "Null"



Assurances:

Confidentiality "Confidentiality" Boolean edit default: "False"

Availability  "Availability" Boolean edit default: "False"

Authenticity  "Authenticity" Boolean edit default: "False"

NonRepudiation "Non-Repudiation" Boolean edit default: "False"

Certifiable  "Certifiable" Boolean edit default: "False"

Privacy "Privacy" Boolean edit default: "False"

Trustworthy "Trust" Boolean edit default: "False"
Inheritance Note:
When a CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to any (:Asset) exists for this (:Component), all Criticality and Assurance Boolean properties are computed by the Backend per Section 3.3.4.6.2 and are fixed (not directly editable by the User). When no such CURRENT relationships exist, these properties are directly editable.



Reference Characterization:

ReferenceApplicabilityStatement "Applicability Statement:" String edit default: "Null"

ReferenceExposureDescription "Exposure Description:" String edit default: "Null"

ReferenceAssumption "Assumption:" String edit default: "Null"



Threat / Property Context:

ThreatSurface "Threat Surface:" String edit default: "Null"

TechnologyType "Technology Type:" String edit default: "Null"

DeploymentContext "Deployment Context:" String edit default: "Null"







#### 3.3.10.8 Purpose

None — type-unique properties are defined on the (:UseCase) node type, which is the primary subordinate of (:Purpose).  See Section 3.3.10.34 for (:UseCase) type-unique properties.

#### 3.3.10.9 State

StateSequence  "Sequence:"  Integer  edit  default: Null

StateSequence is the User-assigned ordinal position of this (:State) in the
system operational lifecycle (e.g. Off = 0, Boot = 1, Ready = 2, Operate = 3).
It is used by the Loss Tool to assign default SANDSequence values on SAND
[:AT_RELATES_TO] edges when the User designates that States must be traversed
in sequence for an attack path. StateSequence is optional; States without a
StateSequence value may still participate in Attack Trees using manually
assigned SANDSequence values on the [:AT_RELATES_TO] edge.

StateSequence values within a SoI SHOULD be unique but the Backend SHALL
NOT enforce uniqueness; two States at the same lifecycle position are
analytically valid (e.g. parallel operational modes at sequence 3).

Transitions:
The [:TRANSITIONS_TO] relationship SHALL support the following properties:
TransitionKind "Transition Kind:" Enum {FUNCTIONAL, COUNTERMEASURE_REQUIRED, BOTH} edit default: "FUNCTIONAL"
Trigger "Trigger:" String edit default: "Null"
GuardCondition "Guard Condition:" String edit default: "Null"
Rationale "Rationale:" String edit default: "Null"
Where TransitionKind = COUNTERMEASURE_REQUIRED or BOTH, RequiredByCountermeasureHID and/or RequiredByCountermeasureUUID SHALL identify the governing (:Countermeasure).

Inheritance Note:
(:State) nodes do not carry Criticality or Assurance properties. [:HOLDS], [:TRANSPORTS], and [:USES] relationships from (:State) to (:Asset) are permitted per Section 3.3.4.3 but do not generate criticality inheritance on the (:State) node itself. State-scoped Asset relationships govern the state context of entity-to-Asset relationships recorded in TraceStateHID.

Countermeasure Traceability:

RequiredByCountermeasureHID "Required By Countermeasure HID:" String fixed default: "Null"
RequiredByCountermeasureUUID "Required By Countermeasure UUID:" String fixed default: "Null"



Analysis:

Priority "Priority:" Integer edit default: "Null"
ResidualRiskNote "Residual Risk Note:" String edit default: "Null"


#### 3.3.10.10 ControlStructure

Control Structures:

ControlStructureJSON "Diagram Layout:" serialized JSON document fixed default: N/A
The Backend graph is the sole authoritative source for semantic structure; this property stores visual layout and display state only.

#### 3.3.10.11 Asset

Type:

Note:  An Asset may be either Organic (where it is important to this particular system), Horizontal (it is important to something else but not this system) or Derived (it is only important because of its relationship to a parent Asset).  If an Asset is Organic or Horizontal, it will have no parent (AssetParent="Null").  If  an Asset is derived, it must have at least one parent which may be of any AssetType.  Tools will make use of this parentage relationship to create trees from Assets to show their derived children.

AssetType  "Type: " Enum {Organic, Horizontal, Derived} edit default: "Null"
AssetParent  "Parent:" (:Asset {uuid}) edit default: "Null"

Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  " string edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  " string edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description:  " string edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  " string edit default "Null"



Assurances:

Confidentiality "Confidentiality" Boolean edit default: "False"

Availability  "Availability" Boolean edit default: "False"

Authenticity  "Authenticity" Boolean edit default: "False"

NonRepudiation "Non-Repudiation" Boolean edit default: "False"

Certifiable  "Certifiable" Boolean edit default: "False"

Privacy "Privacy" Boolean edit default: "False"

Trustworthy "Trust" Boolean edit default: "False"





#### 3.3.10.12 Constraint

Constraint:

CStatement "Constraint Statement:" String edit default: "Null"

#### 3.3.10.13 Requirement

Requirement:

RStatement: "Text: " String edit default: "Null"
VMethod  "Method: " Enum {Inspection, Demonstration, Analysis, Test, Similarity} edit default: "Null"
VStatement: "Verification Statement: " String edit default: "Null"



Analytical State:

Baseline "Baseline:  " String fixed default: "None"
Orphan   "Orphan" Boolean fixed default: "True"
Barren  "Barren" Boolean fixed default: "True"





#### 3.3.10.14 Validation

Validation:

VStatement  "Validation Statement: " String edit default: "Null"

VMethod  "Method: " Enum {Inspection, Demonstration, Analysis, Test, Similarity} edit default: "Null"



#### 3.3.10.15 Control

Control:

ControlStatement: "Control Statement: " String edit default: "Null"
SatisfactionStatement "Satisfaction Statement: " String edit default: "Null"


NIST SP 800-53r5
Reference:
ReferenceFramework "Framework:" String fixed default: "Null"
ReferenceID "Reference ID:" String fixed default: "Null"
ReferenceURL "Reference URL:" String fixed default: "Null"

ReferenceFramework, ReferenceID, and ReferenceURL are populated automatically
when the SecurityControl is cloned from a (:NIST_Control) or
(:NIST_Enhancement) Reference node per Section 3.4.6.2. NIST catalog content
(control statement, discussion, related controls, enhancements) is NOT copied
onto the SecurityControl node; it remains readable through the [:REFERENCES]
relationship in the Reference Tool.

Implementation:
EvidenceOfImplementation "Evidence of Implementation:" String edit default: "Null"


#### 3.3.10.16 Countermeasure

Attack Tree Metrics:

MetricsJSON  "Tree Metrics:"  String (serialized JSON)  edit  default: Null

MetricsJSON SHALL be a JSON object where each key is a metric name matching
a metric defined in the MetricDefinitionsJSON of the (:Loss) nodes whose
Attack Trees include this Countermeasure, and each value is the metric
contribution of this Countermeasure when it partially blocks an Attack path
(e.g. raising the cost or reducing the probability of an attack succeeding
through this Countermeasure).

A null MetricsJSON means no metric modification is applied when this
Countermeasure appears in an Attack Tree; the Countermeasure is treated as
a structural node only (its presence affects path structure but not metric
values unless explicitly configured).

Example: {"AttackCost": 50000, "AttackProbability": 0.001}



#### 3.3.10.17 Verification
Verification:
Procedure "Procedure:" String edit default: "Null"
VStatus "Status:" Enum {NOT_RUN, PASSED, FAILED, WAIVED} edit default: "NOT_RUN"


#### 3.3.10.18 ControlAlgorithm

cloned from related node



#### 3.3.10.19 ProcessModel

cloned from related node



#### 3.3.10.20 ControlAction

User defined



#### 3.3.10.21 Feedback

User defined



#### 3.3.10.22 ControlledProcess

cloned from related node



#### 3.3.10.23 Hazard

User defined or cloned from reference data



#### 3.3.10.24 Loss



Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  " string edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  " edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description:  " string edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  " string edit default "Null"



Constraint on Criticality properties

The Frontend SHALL enforce the rule that a (:Loss) has a single true criticality.  All others must be "False".



##### 3.3.10.24.1 Loss Computed Attack Tree:



**Attack Tree Metadata:**

AttackTreeFormat  "Format:"  String  fixed  default: "SSTPA-ATF-2.0"
AttackTreeVersion  "Version:"  Integer  fixed  default: 0
*AttackTreeVersion is incremented by 1 on every successful Loss Tool Commit
that modifies the Attack Tree graph or its layout. Version 0 indicates the
tree has never been built.*
AttackTreeCreated  "Tree Created:"  datetime  fixed  default: Null
AttackTreeLastModified  "Tree Last Modified:"  datetime  fixed  default: Null
AttackTreeCreatedBy  "Created By:"  String  fixed  default: Null
AttackTreeCreatedByEmail  "Contact:"  String  fixed  default: Null
AttackTreeStatus  "Tree Status:"  Enum {NOT_BUILT, AUTO_GENERATED, ANALYST_REFINED, BASELINED, EXPORTED, INVALIDATED}  edit  default: "NOT_BUILT"

*Status semantics:*

* *NOT_BUILT: No Attack Tree has been built for this Loss.*
* *AUTO_GENERATED: Tree was built automatically from Trace and Attack Tool data without analyst modification.*
* *ANALYST_REFINED: Analyst has made at least one modification to the auto-generated tree.*
* *BASELINED: Tree has been formally approved and baselined. Modifications require re-baseline.*
* *EXPORTED: Tree has been exported for certification package inclusion.*
* *INVALIDATED: Core Data has changed since the last build in a way that makes the tree inconsistent. See ValidationFindings in AttackTreeJSON.*

\---

**Attack Tree Computed Properties:**

TreeIsValid  "Tree Valid:"  Boolean  fixed  default: False

*True when the Attack Tree passes all structural validity rules: root present, at least one complete path from Loss to a leaf, no cycles, all LossHID references match this node's HID, no dangling references. Computed by the Backend on every Commit.*

TreeHasRVs  "Has Residual Vulnerabilities:"  Boolean  fixed  default: False

*True when at least one leaf (:Attack) node exists in the tree that has no outgoing [:AT_RELATES_TO] edge to a (:Countermeasure) and is not marked TailoredOut = True. Computed by the Backend on every Commit.*

PathCount  "Path Count:"  Integer  fixed  default: Null

*The number of distinct root-to-leaf paths in the Attack Tree. A path is any sequence of nodes from the (:Loss) root to a terminal leaf node following [:AT_RELATES_TO] edges where TailoredOut = False. Computed by the Backend on every Commit. May be large (>1,000,000 for complex trees); the Backend SHALL support this computation with bounded traversal.*

LastTreeBuild  "Last Built:"  datetime  fixed  default: Null

*Timestamp of the most recent successful full tree computation (auto-build or rebuild). Updated on every Commit that triggers a full recomputation.*

\---

**Attack Tree Metric Definitions:**

MetricDefinitionsJSON  "Metric Definitions:"  String (serialized JSON)  edit  default: Null

*MetricDefinitionsJSON stores the User-defined metric configurations for this Loss's Attack Tree. It is an array of metric definition objects. Each object SHALL conform to the following structure:*

```json
{
  "MetricName": "AttackCost",
  "MetricDirection": "MINIMIZE",
  "LeafDefault": 0,
  "ANDFormula": "SUM",
  "ORFormula": "MIN",
  "SANDFormula": "SUM",
  "AcceptanceThreshold": 1000000,
  "ThresholdDirection": "ABOVE",
  "Description": "Estimated cost in USD for an attacker to execute this path"
}
```

*MetricDirection: MINIMIZE means a lower root value is safer (cost, probability of success). MAXIMIZE means a higher root value is safer (e.g. detection probability).*

*Formula options: SUM, PRODUCT, MIN, MAX.*

*Common configurations:*

* *Attack Cost: ANDFormula=SUM (must defeat all), ORFormula=MIN (attacker picks cheapest path), SANDFormula=SUM.*
* *Attack Probability: ANDFormula=PRODUCT, ORFormula=MAX, SANDFormula=PRODUCT.*

*MetricDefinitionsJSON is editable by the User at any time. Changing it invalidates all MetricCacheJSON entries on [:AT_RELATES_TO] edges; a full recomputation is required.*
MetricName values SHALL be unique within a single Loss's MetricDefinitionsJSON.
MetricDefinitionsJSON content is engineering data: the G2M translator
(Section 3.7) SHALL materialize each metric definition as attribute values on
the KerML Loss element, and leaf/contribution values from MetricsJSON on
(:Attack) and (:Countermeasure) nodes as attribute values on the
corresponding KerML elements. MetricCacheJSON is computed tool state and is
never translated.


\---

**Attack Tree JSON (Layout and Validation Snapshot):**

*AttackTreeJSON serves two purposes:*

*1. Layout persistence: stores the visual presentation state of the Attack Tree diagram, including node positions, tier assignments, horizontal ordering, and viewport state. This allows the Loss Tool to restore the diagram exactly as the analyst last left it.*

*2. Validation snapshot: stores a fingerprint of the Core Data state at the time of the last successful tree build. This allows the Loss Tool to detect when Core Data has changed in ways that may invalidate the tree, and to surface those changes as specific findings to the analyst.*

*AttackTreeJSON SHALL have the following top-level structure:*

```json
{
  "schema": "SSTPA-ATF-2.0",
  "lossHID": "LOS_1.2_3",
  "lossuuid": "...",
  "assetHID": "AST_1.2_1",
  "environmentHID": "ENV_1.2_1",
  "builtAt": "2026-05-24T12:00:00Z",
  "attackTreeVersion": 7,

  "layout": {
    "viewport": { "centerX": 0, "centerY": 0, "zoom": 1.0 },
    "nodes": [
      {
        "nodeKey": "LOS_1.2_3",
        "nodeType": "Loss",
        "tier": 0,
        "xPosition": 500,
        "yPosition": 0,
        "isExpanded": true
      }
    ],
    "edges": [
      {
        "sourceKey": "LOS_1.2_3",
        "targetKey": "ENV_1.2_1",
        "lossHID": "LOS_1.2_3",
        "curvePoints": []
      }
    ],
    "metricDisplayEnabled": true,
    "visibleMetrics": ["AttackCost", "AttackProbability"],
    "tierLabelVisible": true
  },

  "validationSnapshot": {
    "snapshotAt": "2026-05-24T12:00:00Z",
    "environmentHID": "ENV_1.2_1",
    "environmentName": "Storage",
    "states": [
      {
        "stateHID": "ST_1.2_1",
        "stateName": "Off",
        "stateSequence": 0,
        "validInEnvironment": true,
        "traceEntities": [
          {
            "entityHID": "EL_1.2_2",
            "entityType": "Element",
            "entityName": "Server Module",
            "traceRelType": "HOLDS",
            "traceStatus": "CURRENT"
          }
        ]
      }
    ],
    "attacks": [
      {
        "attackHID": "ATK_1.2_1",
        "attackName": "Privilege Escalation",
        "exploitsHIDs": ["EL_1.2_2"],
        "metricsSnapshot": { "AttackCost": 5000, "AttackProbability": 0.15 }
      }
    ],
    "countermeasures": [
      {
        "countermeasureHID": "CM_1.2_1",
        "countermeasureName": "Access Control Policy",
        "blocksAttackHIDs": ["ATK_1.2_1"],
        "metricsSnapshot": { "AttackCost": 50000 }
      }
    ]
  },

  "validationFindings": [
    {
      "findingType": "ENTITY_REMOVED",
      "severity": "ERROR",
      "affectedHID": "EL_1.2_3",
      "description": "Entity EL_1.2_3 (Database Module) was removed from the SoI after the last tree build. Its Attack Tree participation at Tier 2 under State ST_1.2_2 is now invalid.",
      "detectedAt": "2026-05-25T08:30:00Z"
    }
  ]
}
```

*The `validationSnapshot` section records the identity and key properties of all
nodes and relationships that the Attack Tree depends on at the time of the last
build. On every open of the Loss Tool, the Backend compares this snapshot against
the current graph state and populates `validationFindings` with any discrepancies.*

*Validation finding types and their severities:*

|FindingType|Severity|Description|
|-|-|-|
|ENTITY_REMOVED|ERROR|An entity (State, Interface, Function, Element) that participates in this tree no longer exists in the SoI.|
|ENTITY_RENAMED|WARNING|An entity's Name has changed since the last build. May indicate a scope change.|
|TRACE_SUPERSEDED|WARNING|A Trace relationship used to populate Tier 2 is now SUPERSEDED. A re-trace may be needed.|
|TRACE_INVALIDATED|ERROR|A Trace relationship is INVALIDATED. The entity-Asset association that justified Tier 2 participation no longer exists.|
|ATTACK_REMOVED|ERROR|An (:Attack) node participating in this tree has been deleted from the SoI.|
|ATTACK_EXPLOITS_BROKEN|ERROR|An (:Attack) no longer has an [:EXPLOITS] relationship to the entity it attacks in this tree.|
|COUNTERMEASURE_REMOVED|ERROR|A (:Countermeasure) node participating in this tree has been deleted from the SoI.|
|COUNTERMEASURE_BLOCKS_BROKEN|ERROR|A (:Countermeasure) no longer has a [:BLOCKS] relationship to the Attack it counters in this tree.|
|ENVIRONMENT_CHANGED|WARNING|The (:Environment) associated with this Loss has had its properties changed since the last build.|
|STATE_VALID_IN_REMOVED|WARNING|A [:VALID_IN] relationship between a State and the Loss's Environment has been removed, making a State that appears in this tree analytically out of scope.|
|DERIVED_ASSET_REMOVED|ERROR|A Derived Asset introduced in this tree has been deleted, leaving a terminal Countermeasure edge with no valid target.|
|METRIC_DEFINITION_CHANGED|WARNING|MetricDefinitionsJSON has been modified since the last build. Cached metric values are stale and must be recomputed.|
|NEW_TRACE_ENTITY|INFO|A new entity has been added to the Trace analysis for this Asset+State combination since the last build. The tree may be incomplete.|
|NEW_ATTACK|INFO|A new (:Attack) has been associated to an entity in this tree since the last build. The tree may be incomplete.|

*Severity semantics:*

* *ERROR: The tree cannot be trusted as accurate. Loss Tool SHALL display INVALIDATED status and block export until resolved or acknowledged.*
* *WARNING: The tree may be stale. Loss Tool SHALL display WARNING badge. Export is permitted with analyst acknowledgment.*
* *INFO: New data is available that might extend the tree. Loss Tool SHALL display an information notification.*

*Findings are generated by the Backend on Loss Tool open, on explicit "Validate Tree" command, and after every Commit that modifies nodes or relationships referenced in the snapshot. The Backend SHALL update the validationFindings array and set AttackTreeStatus = INVALIDATED if any ERROR findings are present.*

*When an analyst resolves a finding (e.g. by rebuilding the tree after removing the affected node), the resolved finding SHALL be removed from validationFindings by the next Commit.*

*NOTE: The schema version, snapshot structure, and finding types described here
are the authoritative specification for AttackTreeJSON content. Section 3.4.7
(previously referenced as containing an example) SHALL be updated to reflect
this schema or removed.*







##### 3.3.10.24.2 Assurances on Loss:

Confidentiality "Confidentiality" Boolean edit default: "False"

Availability  "Availability" Boolean edit default: "False"

Authenticity  "Authenticity" Boolean edit default: "False"

NonRepudiation "Non-Repudiation" Boolean edit default: "False"

Certifiable  "Certifiable" Boolean edit default: "False"

Privacy "Privacy" Boolean edit default: "False"

Trustworthy "Trust" Boolean edit default: "False"



Constraint on Assurance properties

The Frontend SHALL enforce the rule that a (:Loss) has a single true Assurance.  All others must be "False".





#### 3.3.10.25  Attack

User defined or cloned from Reference Data (ATT\&CK Tactic, ATT\&CK Technique,
ATT\&CK Sub-Technique, ATLAS Technique, EMB3D Vulnerability).

Classification:

AttackLevel  "Level:"  Enum {STRATEGY, TACTIC, PROCEDURE}  edit  default: "TACTIC"

AttackLevel records the abstraction level of this Attack node, consistent with
the MITRE ATT\&CK framework:

* STRATEGY: High-level attack concept (analogous to ATT\&CK Tactic group).
* TACTIC: A specific method or technique (analogous to ATT\&CK Technique).
* PROCEDURE: A concrete, system-specific exploit (analogous to ATT\&CK Procedure
or Sub-Technique).

IsRVCandidate  "Residual Vulnerability Candidate:"  Boolean  edit  default: False

When True, this Attack is considered a plausible Residual Vulnerability for
the SoI. Set by the analyst in the Attack Tool.

Reference:

ReferenceFramework  "Framework:"  String  edit  default: "Null"

ReferenceID  "Reference ID:"  String  edit  default: "Null"

ReferenceURL  "Reference URL:"  String  edit  default: "Null"

ReferenceFramework, ReferenceID, and ReferenceURL record the external framework
item from which this Attack was cloned (e.g. "ATT\&CK", "T1059.001",
"https://attack.mitre.org/techniques/T1059/001/"). These fields are populated
automatically when the Attack is created from Reference Data via the Reference
Tool. User-created Attacks may leave these Null.

Attack Tree Metrics:

MetricsJSON  "Tree Metrics:"  String (serialized JSON)  edit  default: Null

MetricsJSON stores the leaf-node metric values for this Attack when it appears
as a leaf in an Attack Tree. Each key is a metric name matching a metric defined
in MetricDefinitionsJSON on the owning (:Loss), and each value is the numeric
leaf value for that metric.

Example: {"AttackCost": 5000, "AttackProbability": 0.15}

A null MetricsJSON at a leaf node causes the tree to use the LeafDefault value
from MetricDefinitionsJSON for that metric.

MetricsJSON values on branch (non-leaf) (:Attack) nodes are ignored; branch
values are computed from children per the formula in MetricDefinitionsJSON.

```




#### 3.3.10.26 FunctionalFlow

Flow Diagram:
FunctionalFlowJSON "Diagram Layout:" serialized JSON document fixed default: N/A

The Backend graph is the sole authoritative source for semantic structure; this property stores visual layout and display state only.

#### 3.3.10.27 Goal

GSN Info:

GoalID "GSN ID:" Integer fixed default: "N/A"
GoalStatement "Goal Statement" String edit default: "Null"



Diagram Layout:

GoalStructure "Diagram Layout:" String (serialized JSON) fixed default: "Null"

The Backend graph is the sole authoritative source for semantic structure; this property stores visual layout and display state only.

#### 3.3.10.28 Context

GSN Info:

ContextID "GSN ID:" Integer fixed default: "N/A"

ContextStatement "Context: " String edit default: "Null"



#### 3.3.10.29 Assumption

GSN Info:

AssumptionID "GSN ID:" Integer fixed default: "N/A"

AssumptionStatement "Assumption: " String edit default: "Null"



#### 3.3.10.30 Justification

GSN Info:

JustificationID "GSN ID:" Integer fixed default: "N/A"

JustificationStatement "Justification: " String edit default: "Null"



#### 3.3.10.31 Strategy

GSN Info:

StrategyID "GSN ID:" Integer fixed default: "N/A"

StrategyStatement "Strategy: " String edit default: "Null"



#### 3.3.10.32 Solution

GSN Info:

SolutionID "GSN ID:" Integer fixed default: "N/A"

SolutionStatement "Solution: " String edit default: "Null"



#### 3.3.10.33 Regime

Criticality:

SafetyCritical "Safety:" Boolean edit default: "False"

SafetyLevel "Level" Integer edit default: "Null"

SafetyDescription: "Description:  " edit default "Null"



MissionCritical: "Mission:" Boolean edit default: "False"

MissionLevel: "Level" Integer edit default: "Null"

MissionDescription "Description:  " edit default "Null"



FlightCritical "Flight: " Boolean edit default: "False"

FlightLevel "Level" Integer edit default: "Null"

FlightDescription "Description: " string edit default "Null"



SecurityCritical "Security:" Boolean edit default: "False"

SecurityLevel "Level" Integer edit default: "Null"

SecurityDescription "Description:  " string edit default "Null"



Contact Info:

AuthorityName "Name: " string edit default "Null"

AuthorityTitle "Title: " string edit default "Null"

AuthorityOrg "Organization: " string edit default "Null"

AuthorityEmail  "Email: " string edit default "Null"

SupInfo "Supplumental: " string edit default "Null"



Authoritative Documentation:

DomainGuidance "Guidance: " string edit default "Null"



#### 3.3.10.34 UseCase

## A (:UseCase) node represents a named scenario in which external Actors interact with the SoI through (:Interface) nodes, which enables the SoI to deliver behavior realized by (:SystemFunction) nodes, in satisfaction of the owning (:Purpose).

Use Case Definition:
UCStatement  "Use Case Statement:"  String  edit  default: "Null"
Precondition  "Precondition:"  String  edit  default: "Null"
Postcondition  "Postcondition:"  String  edit  default: "Null"
NormalFlow  "Normal Flow:"  String  edit  default: "Null"
AlternateFlows  "Alternate Flows:"  String  edit  default: "Null"
ExceptionFlows  "Exception Flows:"  String  edit  default: "Null"
---

Actors:
ActorList  "Actors:"  JSON  edit  default: "[]"
ActorList SHALL be a JSON array.  Each element in the array SHALL conform to the following structure:
Field	Type	Description
ActorID	String	Unique identifier within this (:UseCase); short token, e.g. "A1"
ActorName	String	Human-readable name of the external Actor
ActorType	Enum {Human, System, ExternalSystem, Device, Organization}	Type of Actor for SysML diagram rendering
ActorDescription	String	Free-text description of the Actor's role in this Use Case
InterfaceHIDs	Array of String	HIDs of (:Interface) nodes through which this Actor interacts with the SoI
ActorID SHALL be unique within the ActorList of a single (:UseCase).
Every HID in InterfaceHIDs SHALL reference an (:Interface) node that is associated to the same (:UseCase) via [:INVOLVES].
---

Diagram Persistence:
UseCaseDiagramJSON  "Diagram Source:"  JSON  fixed  default: N/A
UseCaseDiagramJSON SHALL be a serialized JSON document sufficient to reproduce the full SysML 2 Use Case Diagram without reference to any external file.  The Backend graph SHALL be the sole source of truth for semantic data; UseCaseDiagramJSON stores only visual layout and display state.
UseCaseDiagramJSON SHALL contain at minimum:
Schema version identifier
(:UseCase) HID and uuid
SoI (:System) HID and Name (for the system boundary label)
Actor positions and display labels (keyed by ActorID)
(:Interface) node positions and display labels (keyed by HID)
(:SystemFunction) node positions and display labels (keyed by HID)
Relationship layout data for all [:INVOLVES], [:INCLUDES], [:EXTENDS], and [:INCLUDES_UC] relationships
Viewport center coordinates and zoom level at last save
Layout version timestamp
UseCaseDiagramJSON SHALL be updated on every successful Commit that changes the diagram layout.
UseCaseDiagramJSON SHALL NOT be used to infer, reconstruct, or substitute for the semantic graph relationships stored in the Backend.
---

Analytical State:
IsComplete  "Complete:"  Boolean  fixed  default: "False"
IsComplete SHALL be computed by the Backend on every Commit and set to True only when all completeness conditions defined in Section 6.5.12.9 are satisfied.
ValidationStatus  "Validation Status:"  Enum {NotValidated, Valid, Invalid, Warning}  fixed  default: "NotValidated"
Priority  "Priority:"  Integer  edit  default: "Null"
Rationale  "Rationale:"  String  edit  default: "Null"
---

Outgoing Relationship Properties:
[:INCLUDES] has no additional properties beyond the standard relationship.
[:INVOLVES] has no additional properties beyond the standard relationship.
[:EXTENDS] SHALL carry the following property:
ExtensionPoint  "Extension Point:"  String  edit  default: "Null"
Extension point identifies the named location in the base (:UseCase) at which the extending (:UseCase) inserts behavior, ExtensionPoint identifies the named location in the base (:UseCase) at which
the extending (:UseCase) inserts behavior. SysML 2.0 does not define an
extend relationship; see Section 3.3.4.7 and Section 3.7.6 for the standard
translation ([:EXTENDS] → use case specialization annotated #extend with an
extensionPoint metadata attribute).
[:INCLUDES_UC] has no additional properties beyond the standard relationship.



---



## 3.4 External Reference Framework Data Model

Overview and Design Principles:
The SSTPA Tool Backend SHALL host read-only imported reference framework data representing the authoritative external knowledge bases used in system security analysis. These frameworks are the intellectual property of their respective originators and are used under the terms of their published licenses. The SSTPA Sustainment Environment (Section 9) is responsible for acquiring, normalizing, transforming, and loading this data. The Backend stores the final transformed graph representation.
The three frameworks hosted are:
MITRE ATT&CK v19 (Enterprise, ICS, Mobile domains) — tactics, techniques, sub-techniques, mitigations, groups, software, campaigns, detection strategies, analytics, data components, and assets. Source format: STIX 2.1 JSON bundles. License: Apache 2.0 / CC BY 4.0.
MITRE ATLAS v5.x (Adversarial Threat Landscape for AI Systems) — tactics, techniques, sub-techniques, mitigations, and case studies targeting AI/ML systems. Source format: YAML (canonical ATLAS.yaml). License: Apache 2.0.
NIST SP 800-53 Rev 5.2 — security and privacy control catalog. Source format: OSCAL JSON catalog. License: NIST public domain (no copyright restrictions on NIST-authored content; SSTPA attribution required).
All imported reference data SHALL be:
Read-only to all Users and Admins via the Frontend and Add-on Tools.
Immutable in the Backend except during a sanctioned Sustainment Environment update cycle.
Stored in a named graph partition separate from Core Data Model SoI sub-graphs.
Identified by a framework root node carrying version metadata.
Preserved in its original property content (no property may be silently dropped or modified during import).
The purpose of hosting this data is to allow SSTPA Tool users to navigate authoritative reference content, read item properties, and clone selected item properties into Core Data nodes via the Reference Tool (Section 6.5.4). The cloning operation creates a new owned node in Core Data; it does not link into or modify the reference graph.
---

### 3.4.1 MITRE ATT&CK Framework — Graph Model

#### 3.4.1.1 Current Version and Source

MITRE ATT&CK v19.1 is the current baseline (released May 2026). It encompasses three domains delivered as separate STIX 2.1 bundle files:
Enterprise ATT&CK: 15 tactics, 222 techniques, 475 sub-techniques, 174 groups, 821 software, 56 campaigns, 44 mitigations, 697 detection strategies, 1758 analytics, 106 data components.
ICS ATT&CK: 12 tactics, 79 techniques, 18 sub-techniques, 14 groups, 23 software, 8 campaigns, 52 mitigations, 18 assets, 97 detection strategies, 96 analytics, 36 data components.
Mobile ATT&CK: 12 tactics, 77 techniques, 47 sub-techniques, 20 groups, 126 software, 3 campaigns, 13 mitigations, 124 detection strategies, 211 analytics, 29 data components.
Source repository: `https://github.com/mitre-attack/attack-stix-data`
Source files consumed by the Sustainment Environment:
`enterprise-attack/enterprise-attack-19.1.json`
`ics-attack/ics-attack-19.1.json`
`mobile-attack/mobile-attack-19.1.json`

#### 3.4.1.2 STIX 2.1 to SSTPA Node Type Mapping

The following table defines the authoritative mapping from STIX 2.1 object types in the ATT&CK bundle to SSTPA Reference Graph node labels.
STIX 2.1 Type	ATT&CK Concept	SSTPA Node Label	Domain Applicability
`x-mitre-tactic`	Tactic	(:AK_Tactic)	Enterprise, ICS, Mobile
`attack-pattern`	Technique / Sub-Technique	(:AK_Technique)	Enterprise, ICS, Mobile
`course-of-action`	Mitigation	(:AK_Mitigation)	Enterprise, ICS, Mobile
`intrusion-set`	Group (Threat Actor)	(:AK_Group)	Enterprise, ICS, Mobile
`malware` or `tool`	Software	(:AK_Software)	Enterprise, ICS, Mobile
`campaign`	Campaign	(:AK_Campaign)	Enterprise, ICS, Mobile
`x-mitre-data-source`	Data Source (deprecated v18+)	(:AK_DataSource)	Enterprise, Mobile
`x-mitre-data-component`	Data Component	(:AK_DataComponent)	Enterprise, ICS, Mobile
`x-mitre-detection-strategy`	Detection Strategy	(:AK_DetectionStrategy)	Enterprise, ICS, Mobile
`x-mitre-analytic`	Analytic	(:AK_Analytic)	Enterprise, ICS, Mobile
`x-mitre-asset`	ICS Asset	(:AK_Asset)	ICS
`x-mitre-matrix`	Matrix	(:AK_Matrix)	Enterprise, ICS, Mobile
Framework root nodes:
(:ATT_CK_Enterprise_19) — root for Enterprise domain
(:ATT_CK_ICS_19) — root for ICS domain
(:ATT_CK_Mobile_19) — root for Mobile domain

#### 3.4.1.3 Node Properties

All ATT&CK reference nodes SHALL carry the common Reference Framework Identity properties defined in Section 3.4.5, plus the following ATT&CK-specific properties preserved from the STIX source:
All (:AK_*) node types:
SSTPA Property	STIX Source Field	Description
ExternalID	`external_references[0].external_id` where `source_name` = "mitre-attack"	ATT&CK ID (e.g. T1059, TA0001)
StixID	`id`	Full STIX 2.1 object identifier
StixType	`type`	Original STIX object type string
Name	`name`	Display name
ShortDescription	First sentence of `description` (truncated at 500 chars)	Short summary
LongDescription	Full `description`	Full markdown description
StixCreated	`created`	STIX creation timestamp
StixModified	`modified`	STIX last modified timestamp
StixVersion	`x_mitre_version`	ATT&CK object version string
IsDeprecated	`x_mitre_deprecated`	Boolean; default False
IsRevoked	`revoked`	Boolean; default False
Domain	Derived from source file (enterprise / ics / mobile)	ATT&CK domain
Platforms	`x_mitre_platforms`	Array of platform strings
RawData	Full serialized source STIX JSON for this object	Preserved source verbatim
(:AK_Technique) additional properties:
SSTPA Property	STIX Source Field
IsSubTechnique	`x_mitre_is_subtechnique`
ParentTechniqueID	`x_mitre_parent_technique_id` (if sub-technique)
TacticIDs	Array extracted from `kill_chain_phases[*].phase_name`
DetectionText	`x_mitre_detection` (if present; deprecated in v18+)
Permissions	`x_mitre_permissions_required`
DataSources	`x_mitre_data_sources` (if present; deprecated in v18+)
TechniqueMaturity	`x_mitre_maturity` (if present)
(:AK_Tactic) additional properties:
SSTPA Property	STIX Source Field
ShortName	`x_mitre_shortname`
TacticOrder	Derived from position in matrix tactic list
(:AK_Group) additional properties:
SSTPA Property	STIX Source Field
Aliases	`aliases`
AssociatedGroups	`x_mitre_associated_groups`
CountryCode	Extracted from description (best-effort; stored as-described)
(:AK_Software) additional properties:
SSTPA Property	STIX Source Field
SoftwareType	`type` (malware or tool)
Platforms	`x_mitre_platforms`
Aliases	`x_mitre_aliases`
(:AK_DetectionStrategy) additional properties:
SSTPA Property	STIX Source Field
DetectionStrategyType	`x_mitre_detection_type`
AnalyticType	`x_mitre_analytic_type`
DataComponentRef	`x_mitre_data_component_ref`

#### 3.4.1.4 ATT&CK Reference Graph Relationships

The following relationships SHALL be created in the Reference Graph from STIX `relationship` objects:
SSTPA Relationship	STIX `relationship_type`	Source STIX Type	Target STIX Type
[:AK_SUBTECHNIQUE_OF]	`subtechnique-of`	attack-pattern	attack-pattern
[:AK_USES_TECHNIQUE]	`uses`	intrusion-set, campaign	attack-pattern
[:AK_USES_SOFTWARE]	`uses`	intrusion-set, campaign	malware, tool
[:AK_MITIGATES]	`mitigates`	course-of-action	attack-pattern
[:AK_DETECTS]	`detects`	x-mitre-data-component	attack-pattern
[:AK_ATTRIBUTED_TO]	`attributed-to`	campaign	intrusion-set
[:AK_TACTIC_CONTAINS]	Derived from kill_chain_phases	x-mitre-tactic	attack-pattern
[:AK_MATRIX_HAS_TACTIC]	Derived from matrix tactic list	x-mitre-matrix	x-mitre-tactic
[:AK_DETECTION_STRATEGY_FOR]	`detection-strategy-for`	x-mitre-detection-strategy	attack-pattern
[:AK_ANALYTIC_FOR]	`analytic-for`	x-mitre-analytic	x-mitre-detection-strategy
[:AK_DATA_COMPONENT_OF]	`data-component-of`	x-mitre-data-component	x-mitre-data-source
[:AK_REVOKED_BY]	`revoked-by`	any	any
Framework root relationships:
(:ATT_CK_Enterprise_19)-[:CONTAINS]->(:AK_Matrix {Domain: "enterprise"})
(:ATT_CK_ICS_19)-[:CONTAINS]->(:AK_Matrix {Domain: "ics"})
(:ATT_CK_Mobile_19)-[:CONTAINS]->(:AK_Matrix {Domain: "mobile"})
---

### 3.4.2 MITRE ATLAS Framework — Graph Model

#### 3.4.2.1 Current Version and Source

MITRE ATLAS v5.4 is the current baseline (February 2026). It contains 1 matrix, 16 tactics, 84 techniques, 56 sub-techniques, 32 mitigations, and 42 case studies.
Source repository: `https://github.com/mitre-atlas/atlas-data`
Source file consumed by the Sustainment Environment:
`dist/ATLAS.yaml` — canonical distributed form containing all tactics, techniques, sub-techniques, mitigations, and case studies.
`dist/schemas/` — JSON Schema files for validation.
ATLAS data is also available in STIX 2.1 format via `mitre-atlas/atlas-navigator-data`. The Sustainment Environment SHALL prefer the canonical ATLAS.yaml as the primary source because it contains the complete object set including Technique Maturity and ATT&CK cross-references not present in all STIX distributions.

#### 3.4.2.2 ATLAS YAML Structure to SSTPA Node Type Mapping

The canonical ATLAS.yaml top-level structure is:

```

id: ATLAS
name: Adversarial Threat Landscape for AI Systems
version: <version>
matrices:

* id: ATLAS
name: ATLAS Matrix
tactics: [...]
techniques: [...]
mitigations: [...]
case-studies: [...]

```

ATLAS YAML Key	ATLAS Concept	SSTPA Node Label
`tactics[]` entry	Tactic	(:AT_Tactic)
`techniques[]` entry where `subtechnique-of` is absent	Technique	(:AT_Technique)
`techniques[]` entry where `subtechnique-of` is present	Sub-Technique	(:AT_Technique) with IsSubTechnique = True
`mitigations[]` entry	Mitigation	(:AT_Mitigation)
`case-studies[]` entry	Case Study	(:AT_CaseStudy)
Framework root node: (:ATLAS_5) — root for ATLAS framework.
3.4.2.3 Node Properties
(:AT_Tactic):
SSTPA Property	ATLAS YAML Field	Description
ExternalID	`id`	ATLAS tactic ID (e.g. AML.TA0001)
Name	`name`	Tactic name
ShortDescription	`description` (truncated)	Short summary
LongDescription	`description`	Full description
TacticOrder	Position in tactics list	Display order
(:AT_Technique):
SSTPA Property	ATLAS YAML Field	Description
ExternalID	`id`	ATLAS technique ID (e.g. AML.T0043)
Name	`name`	Technique name
ShortDescription	`description` (truncated)	Short summary
LongDescription	`description`	Full description
IsSubTechnique	Presence of `subtechnique-of` key	Boolean
ParentTechniqueID	`subtechnique-of`	Parent technique ID if sub-technique
TacticIDs	`tactics[*].id`	Array of parent tactic IDs
ATTACKReference_ID	`ATT&CK-reference.id`	Corresponding ATT&CK technique ID (if adapted)
ATTACKReference_URL	`ATT&CK-reference.url`	URL to corresponding ATT&CK technique
TechniqueMaturity	`technique-maturity`	Maturity level string (e.g. "Theoretical", "Proof of Concept", "Incident Report")
Platforms	`platforms` (if present)	Array of platform strings
(:AT_Mitigation):
SSTPA Property	ATLAS YAML Field	Description
ExternalID	`id`	ATLAS mitigation ID (e.g. AML.M0000)
Name	`name`	Mitigation name
ShortDescription	`description` (truncated)	Short summary
LongDescription	`description`	Full description
MLLifecycleStages	`ml-lifecycle-stages` (if present)	Array of ML lifecycle stage strings
MitigationCategories	`categories` (if present)	Array of category strings
(:AT_CaseStudy):
SSTPA Property	ATLAS YAML Field	Description
ExternalID	`id`	ATLAS case study ID (e.g. AML.CS0001)
Name	`name`	Case study name
ShortDescription	`summary` (truncated)	Short summary
LongDescription	`summary`	Full case study summary
IncidentDate	`incident-date`	Date of the incident
IncidentDateGranularity	`incident-date-granularity`	Date precision (year, month, exact)
ReporterName	`reporter`	Reporting organization
ReferencedTechniqueIDs	Array of technique IDs from `procedure[*].technique`	Techniques used

#### 3.4.2.4 ATLAS Reference Graph Relationships

SSTPA Relationship	Derivation	Source	Target
[:AT_MATRIX_HAS_TACTIC]	Matrix tactics list	(:ATLAS_5)	(:AT_Tactic)
[:AT_TACTIC_CONTAINS]	`techniques[].tactics[].id` match	(:AT_Tactic)	(:AT_Technique)
[:AT_SUBTECHNIQUE_OF]	`subtechnique-of` field	(:AT_Technique) sub	(:AT_Technique) parent
[:AT_MITIGATES]	Derived from mitigation-to-technique mapping in YAML	(:AT_Mitigation)	(:AT_Technique)
[:AT_CASE_USES_TECHNIQUE]	`case-studies[].procedure[].technique`	(:AT_CaseStudy)	(:AT_Technique)
[:AT_MAPS_TO_ATTACK]	`ATT&CK-reference.id` present	(:AT_Technique)	(:AK_Technique) where ExternalID matches
The [:AT_MAPS_TO_ATTACK] cross-framework relationship SHALL be created during import to link ATLAS techniques to their corresponding ATT&CK technique nodes in the Reference Graph, where a valid `ATT&CK-reference` entry exists.
---

### 3.4.3 NIST SP 800-53 Rev 5 — Graph Model

#### 3.4.3.1 Current Version and Source

NIST SP 800-53 Rev 5.2.0 is the current baseline (updated May 2026).
Source repository: `https://github.com/usnistgov/oscal-content`
Source file consumed by the Sustainment Environment:
`nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json` — full OSCAL catalog in JSON format.
3.4.3.2 OSCAL JSON Structure to SSTPA Node Type Mapping
The OSCAL catalog JSON has the following relevant top-level structure:

```json
{
  "catalog": {
    "uuid": "...",
    "metadata": { "title": "...", "last-modified": "...", "version": "..." },
    "groups": [
      {
        "id": "ac",
        "title": "Access Control",
        "controls": [
          {
            "id": "ac-1",
            "title": "Policy and Procedures",
            "params": [...],
            "props": [...],
            "parts": [...],
            "controls": [...]   // control enhancements (sub-controls)
          }
        ]
      }
    ]
  }
}
```

OSCAL Element	NIST Concept	SSTPA Node Label
`groups[]` entry	Control Family	(:NIST_Family)
`controls[]` entry (top-level within group)	Control	(:NIST_Control)
`controls[].controls[]` entry	Control Enhancement	(:NIST_Enhancement)
Framework root node: (:NIST_800_53_R5) — root for NIST SP 800-53 Rev 5 framework.

#### 3.4.3.3 Node Properties

(:NIST_Family):
SSTPA Property	OSCAL Source Field	Description
ExternalID	`groups[].id`	Family identifier (e.g. "ac", "si")
Name	`groups[].title`	Family title (e.g. "Access Control")
FamilyCode	Uppercase of `id`	Abbreviated family code (AC, SI, etc.)
(:NIST_Control):
SSTPA Property	OSCAL Source Field	Description
ExternalID	`controls[].id`	Control identifier (e.g. "ac-1")
ControlID	Canonical padded form (e.g. "AC-01")	Display-form control ID
Name	`controls[].title`	Control title
ShortDescription	Extracted from `parts` where `name` = "statement", first paragraph	Short statement
LongDescription	Full assembled text from all `parts` where `name` = "statement"	Full control statement
SupplementalGuidance	Text from `parts` where `name` = "guidance"	Supplemental guidance
Objectives	Text from `parts` where `name` = "objective" (from 800-53A)	Assessment objectives if present
RelatedControls	Array of related control IDs from `links` where `rel` = "related"	Related control IDs
BaselineImpact	Array derived from `props` where `name` = "baseline-impact"	LOW, MODERATE, HIGH
Priority	From `props` where `name` = "priority"	P1, P2, P3
FamilyID	`groups[].id` of containing group	Parent family identifier
RawData	Full serialized OSCAL JSON for this control object	Preserved source verbatim
(:NIST_Enhancement):
Same properties as (:NIST_Control) plus:
SSTPA Property	OSCAL Source Field	Description
ParentControlID	ID of the containing control	Parent control identifier





#### 3.4.3.4 NIST Reference Graph Relationships



SSTPA Relationship	Derivation	Source	Target
[:NIST_FAMILY_CONTAINS]	Controls within groups	(:NIST_Family)	(:NIST_Control)
[:NIST_CONTROL_HAS_ENHANCEMENT]	Sub-controls within controls	(:NIST_Control)	(:NIST_Enhancement)
[:NIST_RELATED_TO]	`links[rel=related]`	(:NIST_Control)	(:NIST_Control)
(:NIST_800_53_R5)-[:CONTAINS]->(:NIST_Family)	Root-to-family	(:NIST_800_53_R5)	(:NIST_Family)

3.4.4 User-Created Reference Nodes

In addition to the three imported frameworks, Users MAY create Reference nodes of the following types to persist analytical knowledge across the project hierarchy:
(:AK_Procedure) — system-specific procedures not provided by MITRE (detailed attack execution steps). These are created from Core Data (:Attack) nodes by Users and registered for reuse.
User-created Reference nodes SHALL:
Be read-write to the creating User.
Follow all Core Data HID and common property rules (Section 3.3.8, 3.3.9).
Be clearly labeled as user-created (not authoritative) in the Reference Tool.
NOT be treated as authoritative external reference data.

3.4.5 Common Reference Framework Identity Properties

Every Reference Graph node (all types from all three frameworks) SHALL carry the following common identity properties in addition to type-specific properties:
Property	Type	Description
FrameworkName	String	Human-readable framework name (e.g. "MITRE ATT\&CK", "MITRE ATLAS", "NIST SP 800-53 Rev 5")
FrameworkVersion	String	Version string of the framework at time of import
FrameworkDomain	String	Sub-domain if applicable (Enterprise, ICS, Mobile, n/a)
ExternalID	String	Authoritative identifier within the framework (unique within FrameworkName + FrameworkVersion)
ExternalType	String	Original source type string (e.g. "attack-pattern", "course-of-action")
Name	String	Display name
ShortDescription	String	Truncated description (≤500 characters)
LongDescription	String	Full description text
SourceURI	String	URL of the authoritative source repository
ImportedAt	datetime	Timestamp of the Sustainment import operation that loaded this node
LastUpdated	datetime	Timestamp of the most recent Sustainment update that touched this node
RawData	String (serialized JSON/YAML)	Complete preserved source record verbatim
IsDeprecated	Boolean	True if marked deprecated by the source framework
IsRevoked	Boolean	True if revoked by the source framework

### 3.4.6 Core-to-Reference Cloning Relationships

#### 3.4.6.1 Authorized Clone Sources by Core Data Node Type

The following table defines which Reference node types may serve as clone sources for which Core Data node types. When a User clones a Reference node into a Core Data node, the Core Data node receives the Reference node properties listed below, and a [:REFERENCES] relationship is created.
Core Data Node Type	Authorized Reference Clone Sources
(:Attack)	(:AK_Technique), (:AT_Technique)
(:Countermeasure)	(:AK_Mitigation), (:AK_DetectionStrategy), (:AK_Analytic), (:AT_Mitigation), (:EMB3D_CourseOfAction)
(:SecurityControl)	(:NIST_Control), (:NIST_Enhancement)
(:Component)	(:AK_Software), (:AK_Asset), (:EMB3D_Device)
(:Hazard)	(:AK_Technique), (:AT_Technique), (:EMB3D_Vulnerability)
(:System)	(:AK_Group), (:AK_Campaign)

#### 3.4.6.2 Clone Behavior

When a User clones a Reference node into a Core Data node, the Backend SHALL:
Copy the following properties from the Reference node to the Core Data node (these are the properties the Reference node and Core Data node share by design):
Name (if the Core Data node Name is the default "New" or "Null")
ShortDescription (if Null on Core Data node)
LongDescription (if Null on Core Data node)
ExternalID → stored in the Core Data node's ReferenceID property
FrameworkName → stored in the Core Data node's ReferenceFramework property
Create a [:REFERENCES] relationship: (Core Data node)-[:REFERENCES]->(Reference node).
NOT overwrite any Core Data node property that already has a non-null, non-default value, unless the User explicitly authorizes overwrite.
NOT transfer RawData, StixID, ImportedAt, LastUpdated, or any framework-internal identifier to the Core Data node.
Leave the Reference node completely unchanged.
A Core Data node MAY have [:REFERENCES] relationships to multiple Reference nodes (e.g. an (:Attack) node may reference both an ATT\&CK Technique and an ATLAS Technique).

#### 3.4.6.3 Read-Only Constraint

Reference Graph nodes SHALL be read-only to all Users and Admins via the GUI and Add-on Tools.
The only permitted mutation involving Reference Graph data from the GUI SHALL be creation or removal of a [:REFERENCES] relationship between an SSTPA Core Data node and a Reference Graph node.
The Backend SHALL reject any write operation targeting Reference Graph node properties.
---

### 3.4.7 EMB3D Framework — Graph Model

The EMB3D model previously specified as section 3.4.1.2 is retained. The following standardizes its node labels to match the naming convention of this revised section.
EMB3D STIX Type	SSTPA Node Label
`vulnerability`	(:EMB3D_Vulnerability)
`course-of-action`	(:EMB3D_CourseOfAction)
`x-mitre-emb3d-property`	(:EMB3D_Device)
Relationships:
(:EMB3D_CourseOfAction)-[:EMB3D_MITIGATES]->(:EMB3D_Vulnerability)
(:EMB3D_Vulnerability)-[:EMB3D_RELATES_TO_DEVICE]->(:EMB3D_Device)
(:EMB3D_21)-[:CONTAINS]->(:EMB3D_Vulnerability | :EMB3D_CourseOfAction | :EMB3D_Device)
Source file: `https://github.com/mitre/emb3d/blob/main/assets/emb3d-stix-2.0.1.json`


## 3.5 Help Data Model

The Help Data Model needs Help

The Help Data Model consists of:
Help information on GUI fields and input boxes
Tutorial Information
Definitions and description of SSTPA Terminology

## 3.6 Example Data

Example Data consists of pre-defined Projects which the user can modify as part of a tutorial, but can be reset by the system to default values.  For each example, the intended work flow is to open the project, fillow the steps in the tutorial, then reset the example to its default configurations.  The example projects need not be technically correct, but they must be comprehensive to iliustrate specific SSTPA Tool modeling capabilities.

### 3.6.1  Fire Sat Example
"Fire Sat" is an example of a system that is both expansive and deep in hirarchy


## 3.7 SysML 2.0 / KerML 1.0 Interchange Data Model

### 3.7.1 Purpose and Scope

The Core Data Model (Section 3.3) is the single authoritative model. This
section defines its standard textual projection into SysML 2.0 and KerML 1.0
and the two translators that maintain it:

* G2M (Graph-to-Model): Core Data Model → SysML 2.0 / KerML 1.0 textual
notation.
* M2G (Model-to-Graph): SysML 2.0 / KerML 1.0 textual notation → staged Core
Data Model mutations.

The projection SHALL use only the standard textual notations (SysML 2.0
Clause 8.2.2; KerML 1.0 Clause 8.2.2) and the standard extension mechanism
(KerML library packages; metadata definitions specializing
Metaobjects::SemanticMetadata with user-defined keywords). Exported model
text SHALL be readable by a conformant SysML 2.0 / KerML 1.0 implementation
without SSTPA-specific tooling, given the SSTPA Profile Library.

The graph remains authoritative at all times. Model text is a projection;
M2G changes become authoritative only by passing the standard Backend
validation and Commit pipeline.

### 3.7.2 Engineering Translation Set

The following data SHALL be translated:

* Core System Data: every SoI sub-graph, the (:Project) root, and
(:Sandbox) content on User request.
* Example Data (same schema as Core System Data).

The following data SHALL NOT be translated:

* Product Data, User Data (including (:User), (:RootAdmin), (:Mailbox),
(:Message)), Help Data.
* Reference Data (ATT&CK, ATLAS, NIST, EMB3D graphs). A Core node's
[:REFERENCES] relationship IS translated, as an annotation carrying
FrameworkName, ExternalID, and SourceURI only. Reference item content SHALL
never be embedded in exported model text (license preservation).
* Bookkeeping properties on any node: Owner, OwnerEmail, Creator,
CreatorEmail, Created, LastTouch, VersionID. M2G SHALL never set these from
model text; they are assigned by the Backend per Section 3.3.9.1.
* Tool-state JSON properties: AttackTreeJSON, UseCaseDiagramJSON,
ControlStructureJSON, FunctionalFlowJSON, GoalStructure (layout), and
MetricCacheJSON.
* Trace relationships with TraceStatus = SUPERSEDED or INVALIDATED (audit
records). G2M SHALL translate CURRENT trace relationships only, unless the
caller sets an explicit IncludeTraceHistory flag.

### 3.7.3 SSTPA Profile Library

SSTPA Tools SHALL ship a read-only, versioned KerML 1.0 library package named
'SSTPA Profile', stored and served by the Backend alongside Reference Data,
containing:

1. 'SSTPA Domain' — KerML classifiers for all KERML-domain node labels of
Section 3.3.3: Asset, DerivedAsset, Regime, Hazard, Loss, Attack,
Countermeasure, SecurityControl, GsnGoal, GsnStrategy, GsnContext,
GsnAssumption, GsnJustification, GsnSolution, and the STPA roles
(ControlAlgorithm and ControlledProcess as behavior, ControlAction as step,
ProcessModel as struct, Feedback as flow feature). Criticality, Assurance,
metric, and statement properties are declared as features on these
classifiers (with KerML datatypes and enumerations).

2. 'SSTPA Associations' — one KerML assoc per KERML-domain relationship type
of Section 3.7.6 Table 2, with relationship properties declared as features
of the association (e.g., Holds, Transports, Uses with TraceNote and
TraceStatus; AtRefinement with TailoredOut, TailorReason, CompleteBlock,
CompleteBlockReason, AllowedRV, AllowedRVReason; AtAnd, AtOr, AtSand
specializing AtRefinement).

3. 'SSTPA Metadata' — SysML 2.0 metadata definitions specializing
SemanticMetadata, declaring the user-defined keywords used by G2M output and
required by M2G for type resolution of newly authored elements:
#capability, #sandbox, #system, #element, #environment, #purpose,
#validation, #extend (with attribute extensionPoint : String), #involves,
#parents, #externalref (with attributes framework, externalId, sourceUri),
#sstpa (with attribute schemaVersion).

The Profile Library version SHALL be bound to the data schema VersionID. G2M
output SHALL record the profile version via the #sstpa annotation on each
emitted root package. M2G SHALL reject text whose profile version is
incompatible with the Backend schema version.

### 3.7.4 Model Organization and Identity

G2M SHALL organize output as follows:

* The (:Project) maps to a root package.
* Each SoI maps to two packages:
  * a SysML 2.0 package "<SoI Name> System Model" containing all
SYSML-domain content of that SoI; and
  * a KerML 1.0 package "<SoI Name> Security Analysis" containing all
KERML-domain content of that SoI, importing the SysML package and the SSTPA
Profile. Cross-domain relationships (e.g., an Attack exploiting a Component)
are expressed in the analysis package as connectors referencing the SysML
elements by qualified name.
* Child SoIs ((:Component)-[:PARENTS]->(:System)) nest beneath the owning
Component's part.

Identity rules:

* Name → declaredName. Emitted as a KerML unrestricted name (single-quoted)
whenever it is not a legal basic name or equals a reserved word of the target
notation.
* HID → declaredShortName, always emitted in unrestricted form (HIDs contain
"." which is not legal in basic names). Example: part <'SYS_1.2_0'> 'Coastal
Radar'.
* uuid → elementId for JSON/XMI interchange. uuid SHALL NOT be emitted in
textual notation; M2G resolves element identity by HID short name and obtains
uuid from the Backend.
* ShortDescription → a named doc Short; LongDescription → a named doc Full.

### 3.7.5 Node Type Mapping

Table 1 — SYSML domain (emitted in the System Model package):

| Core node | SysML 2.0 construct | Keyword | Notes |
|---|---|---|---|
| (:Project) | package | #capability | MissionAction/MissionMeans/MissionContribution as metadata attributes; owned Requirements as requirement usages. |
| (:Sandbox) | package | #sandbox | |
| (:System) | part (SoI root part) | #system | |
| (:Component) | part | #element | |
| (:Environment) | part | #environment | |
| (:Interface) | port | — | SSTPA Interface is the boundary behavior point; port is the SysML 2.0 construct for it. |
| (:Connection) | connection usage among the mapped ports | — | Binary and n-ary; ConnectionType, OSILayer, Protocol, Directionality, TimingClass, SecurityClass, PayloadDescription as attributes. |
| (:SystemFunction) | action usage | — | |
| (:State) | state usage | — | |
| (:Purpose) | concern usage | #purpose | Concern is the SysML 2.0 requirement kind for stakeholder intent. |
| (:Constraint) | constraint usage | — | CStatement as doc. |
| (:Requirement) | requirement usage owned by its bearer; subject bound to bearer | — | RStatement as doc; VMethod, VStatement, Baseline, Orphan, Barren as attributes. |
| (:Verification) | verification usage | — | Procedure as doc; [:VERIFIED_BY] → verify in the objective. |
| (:Validation) | verification usage | #validation | Objective verifies the owning Purpose's requirements. |
| (:UseCase) | use case usage | — | ActorList entries → actor parameters; UCStatement, Precondition, Postcondition, flows as docs/attributes. |
| (:FunctionalFlow) | view usage | — | Contained elements exposed via expose. |

Table 2 — KERML domain (emitted in the Security Analysis package; all
instances are features typed by SSTPA Profile classifiers):

| Core node | KerML 1.0 construct |
|---|---|
| (:Asset), (:DerivedAsset), (:Regime), (:Hazard), (:Loss), (:Attack), (:Countermeasure), (:SecurityControl) | composite feature : <Profile classifier> with attribute values |
| (:Security) | package 'Security' |
| (:ControlStructure) | package per Control Structure, containing the STPA role features |
| (:ControlAlgorithm), (:ControlledProcess) | feature : behavior classifier |
| (:ControlAction) | step |
| (:ProcessModel) | feature : struct classifier |
| (:Feedback) | flow feature |
| (:GsnGoal) … (:GsnSolution) | feature : <Profile GSN classifier> |

(:Perspective) is a structural container only and is not emitted; its
children are emitted in their domain packages.

### 3.7.6 Relationship Mapping

Table 1 — SYSML domain:

| Core relationship | SysML 2.0 construct |
|---|---|
| [:HAS_SYSTEM], [:HAS_INTERFACE], [:HAS_FUNCTION], [:HAS_ELEMENT], [:HAS_CONNECTION], [:HAS_ASSET]*, [:EXHIBITS], [:ACTS_IN], [:REALIZES] | owning membership (nesting) in the mapped owner; ACTS_IN emits the Environment part as context. *HAS_ASSET nests the Asset feature in the analysis package under the SoI. |
| (:Component)-[:PARENTS]->(:System) | nested part (child SoI package under the Component) |
| [:ALLOCATED_TO] | allocate (allocation usage) |
| [:FLOWS_TO_FUNCTION], [:FLOWS_TO_INTERFACE] | succession flow with attributes (RelationshipNature, PhysicalType, LogicalLayer, Protocol, FlowDirectionality, TimingClass, SecurityClass) |
| [:PARTICIPATES_IN] | connection end binding to the port |
| [:CONNECTS] | binding between port and action (boundary realization) |
| [:TRANSITIONS_TO] | transition usage: transition first <source> then <target>, with TransitionKind, Trigger, GuardCondition, Rationale as attributes |
| [:HAS_REQUIREMENT] | requirement usage owned by bearer, subject = bearer |
| (:Requirement)-[:PARENTS]->(:Requirement) | dependency annotated #parents (DAG; multi-parent cannot nest) |
| [:VERIFIED_BY] | verify membership in the verification usage objective |
| [:HAS_VALIDATION] | owned verification usage annotated #validation |
| [:HAS_CONSTRAINT] | owned constraint usage |
| [:HAS_USECASE] | owned use case usage |
| [:INCLUDES] (UseCase→SystemFunction) | perform of the mapped action |
| [:INVOLVES] (UseCase→Interface) | dependency annotated #involves |
| [:INCLUDES_UC] | include use case |
| [:EXTENDS] | use case specialization annotated #extend(extensionPoint) |
| [:HAS_FUNCTIONAL_FLOW] | owned view usage; [:CONTAINS] members → expose |

Table 2 — KERML domain (each maps to a connector typed by the named Profile
assoc; relationship properties become connector feature values):

| Core relationship | Profile assoc |
|---|---|
| [:HOLDS] / [:TRANSPORTS] / [:USES] | Holds / Transports / Uses (TraceStateHID resolves to a reference to the mapped State) |
| [:VALID_IN] | ValidIn |
| [:HAS_LOSS], [:HAS_GOAL], [:HAS_REGIME], [:DERIVES] | HasLoss, HasGoal, HasRegime, Derives |
| [:HAS_ENVIRONMENT] (Loss→Environment) | LossEnvironment (references the SysML Environment part) |
| [:THREATENS], [:VIOLATES], [:USES_ATTACK] | Threatens, Violates, UsesAttack |
| [:EXPLOITS], [:DEFEATS], [:BLOCKS], [:SUBORDINATE_TO], [:TARGETS_LOSS] | Exploits, Defeats, Blocks, SubordinateTo, TargetsLoss |
| [:ENFORCES], [:MITIGATES], [:SATISFIES] | Enforces, Mitigates, Satisfies |
| [:HAS_CONTROL], [:HAS_COUNTERMEASURE] | nesting in package 'Security' |
| [:APPLIES_TO_FUNCTION/_INTERFACE/_ELEMENT/_STATE/_FEEDBACK] | AppliesTo (end references the mapped SysML/KerML element) |
| (:Countermeasure)-[:HAS_REQUIREMENT] | HasRequirement connector referencing the SysML requirement usage |
| [:AT_RELATES_TO] | AtAnd / AtOr / AtSand connector per the parent gate (D-8); LossHID scopes the connector to the owning Loss feature; SAND sibling order additionally emitted as KerML succession; TailoredOut, CompleteBlock, AllowedRV and reasons as connector feature values |
| [:SUPPORTED_BY], [:IN_CONTEXT_OF] | SupportedBy, InContextOf |
| (:GsnSolution)-[:HAS_VALIDATION/_VERIFICATION/_LOSS] | SolutionEvidence connector referencing the mapped element |
| STPA loop ([:GENERATES], [:COMMANDS], [:CAUSES], [:PRODUCES], [:INFORMS], [:TUNES], [:IMPLEMENTS]) | Generates, Commands, Causes, Produces, Informs, Tunes, Implements |
| [:REFERENCES] (Core→Reference Graph) | #externalref annotation (framework, externalId, sourceUri) on the mapped element; never a model reference into Reference Data |

### 3.7.7 Property Mapping Rules

* Property values map to attribute values typed per Section 3.3.10
(Boolean, Integer, String, datetime, Enum → profile enumeration).
* G2M SHALL omit properties holding their declared default; M2G SHALL treat
absence as the declared default.
* Free-text engineering statements (RStatement, CStatement, GuardCondition,
Trigger, UCStatement, GSN statements) are natural language and SHALL be
carried as docs or string attributes; translators SHALL NOT attempt to parse
them as KerML expressions.
* MetricDefinitionsJSON / MetricsJSON translate per D-15.
* Criticality and Assurance properties computed by inheritance (Section
3.3.4.6.2) ARE emitted (they are engineering results) but M2G SHALL reject
text that attempts to set them on an entity having CURRENT Asset
relationships (they are Backend-computed).

### 3.7.8 G2M Translator Requirements

* G2M SHALL execute in the Backend.
* Scopes: CAPABILITY (whole project), SOI (default), NODESET (panel
selection; output includes elision comments for omitted context).
* Output SHALL be deterministic and idempotent: identical input graphs yield
byte-identical output. Ordering: HID type identifier order of Section
3.3.8.1, then Sequence Number.
* Output SHALL parse without error against the SysML 2.0 / KerML 1.0
textual grammars.
* Reserved-word and special-character escaping SHALL use unrestricted names.
* G2M SHALL never emit content excluded by Section 3.7.2.

### 3.7.9 M2G Translator Requirements

* M2G SHALL execute in the Backend and SHALL be invoked only through the
staged-edit and Commit model (Section 6.3.5.6 / 6.4).
* Pipeline: parse → resolve identity by HID short name → compute change set
(creations, property changes, relationship changes, deletions) against the
live graph → validate against Sections 3.3 and 3.7.5/3.7.6 → present staged
diff → Commit as a single ACID transaction with full ownership and
notification behavior (Section 3.3.9.1).
* Elements without a HID short name are creation candidates; node type is
determined by the construct kind plus profile keyword/typing; the Backend
assigns HID and uuid per Section 3.3.8.
* Constructs outside the mapping tables SHALL be rejected with diagnostics
(line, column, source excerpt, rule identifier). M2G is a data interface for
the SSTPA projection, not a general SysML 2.0 importer.
* Tool authority: M2G SHALL enforce the invoking tool's write authority.
In particular, [:AT_RELATES_TO] mutations are accepted only from the Loss
Tool context (Section 3.3.4.11), and Reference Graph content is never
writable (Section 3.4.6.3).
* Deletions: an element present in the graph scope but absent from submitted
full-scope text SHALL be staged as a deletion only when the caller sets an
explicit AllowDelete flag; otherwise absence is ignored (partial-text
safety).

### 3.7.10 Round-Trip Conformance

* For any graph g within the Engineering Translation Set:
M2G(G2M(g)) SHALL produce an empty change set.
* For any text t accepted by M2G: G2M(M2G(t)) SHALL equal the canonical
form of t.
* These invariants SHALL be implemented as automated conformance tests run
in the Development Pipeline (Section 8) against the Example Data projects.

### 3.7.11 Performance

* G2M: a SoI of 5,000 nodes and 20,000 relationships SHALL translate in
under 2 seconds server-side; NODESET scope for 200 elements in under 250 ms.
* M2G validate: under 1 second for 2,000-line submissions.
* Both translators SHALL stream results and respect the pagination and
bounded-traversal rules of Sections 3.3.2 and 5.6.6.


---

# 4 Startup Software

The Startup Software will allow a User to startup the Frontend application and connect to the Backend.  It will contain security features which authenticate the User prior to launching applications.  In the MVP implementation the Startup Software will startup both the Backend, then the Frontend on the same computer.  The security features will be placeholders for enterprise security post MVP.

The Startup Software will be displayed as a typical desktop application with icon.  Startup Software will be the application the user launches when starting SSTPA Tools.

The Startup Software for this version of SSTPA Tools is a stand in for a security application which authorizes users prior to allowing connection to the Frontend or the Backend.  In this version, all users are authorized and the primary use case is connection from frontend to backend on the same physical machine.

The User launches SSTPA Tools from Startup Software, which collects user information, activates the database and launches the GUI.  When the user exits, the Startup Software will assure the Database connections are properly closed.

Startup Software SHALL launch from a desktop icon or Command line.

The Startup Software SHALL present the user with a dialog with default SSTPA theme and startup animation.

The Startup Software SHALL connect to a Backend or start the Backend on the Local Machine.  In future versions, Startup Software will connect to remote Backends.

Startup Software SHALL present the User with a login window and verify user name and password with the Backend before launching the Frontend.


Startup Software SHALL launch the Frontend Software after User selects or adds a User ID enters information

On receiving the Shutdown command from the Frontend software, Startup Software SHALL assure both frontend and backend are properly shutdown preserving stored data (i.e. don't kill the database while transactions are in process).



# 5 Backend



The Backend database will include the graph database and support software needed for ACID compliance.  It will use the most current stable NEO4J Community Edition with a defined pathway to the Enterprise Edition on customer desire.  Backend will be divided into docker containers and Docker Compose.  User will connect and interact with a reverse proxy which will connect to the database.  The reverse proxy will collect and present telemetry on backend performance.

The Backend SHALL be configured to execute CYPHER_25 scripts.

The back-end SHALL support multiple concurrent connections.

The Backend layout is shown below.


Internet / Remote Clients

* ;                       |
* ;                       | HTTPS :443
* ;                       v
* ;             +----------------------+
* ;             |   Caddy   |
* ;             | TLS + reverse proxy |
* ;             +----------+----------+
* ;                        |
* ;                        | HTTP :8080
* ;                        | (internal only)
* ;                        v
* ;             +----------------------+
* ;             |      Go Backend      |
* ;             | chi + Neo4j driver   |
* ;             | Prom/OTel instr.     |
* ;             +----+-----------+-----+
* ;                  |           |
* ;  Bolt :7687      |           | OTLP :4317 / :4318
* (internal only)    |           |
* ;                  v           v
* ;         +----------------+  +----------------------+
* ;         |     Neo4j      |  | OTel Collector       |
* ;         | Community Ed.  |  | traces/metrics pipe  |
* ;         +----------------+  +----------+-----------+
* ;                                         |
* ;                                         | scrape/export
* ;                                         |
* ;                           +-------------+-------------+
* ;                           |                           |
* ;                           v                           v
* ;                  +----------------+          +----------------+
* ;                  |   Prometheus   |          | Tempo   |
* ;                  | metrics store  |          | trace store    |
* ;                  +-------+--------+          +--------+-------+
* ;                          |                            |
* ;                          +-------------+--------------+
* ;                                        |
* ;                                        v
* ;                                +---------------+
* ;                                |    Grafana    |
* ;                                | dashboards    |
* ;                                +---------------+



The core idea is to have two network zones:



## 5.1 Public edge network


Only the reverse proxy is exposed here.  caddy accepts HTTPS from remote clients forwards requests to the Go backend.  Grafana is exposed for remote dashboard access during development


## 5.2  Private backend network



Everything else talks here.

Go backend

Neo4j

OpenTelemetry Collector

Prometheus

Grafana

Tempo



only the reverse proxy SHALL be internet-facing.



## 5.3 User Facing Container

Backend should put Reverse Proxy and the Grafana in the same container with sufficient software / configuration to present telemetry to external user.


## 5.4  Reverse Proxy

Reverse proxy: Caddy

Responsibilities:

terminate TLS
expose port 443
redirect 80 -> 443
proxy /api/\* to the Go backend
expose Grafana during development

Typical traffic:

Client -> Caddy -> Go backend

---

## 5.5 Database Container

Backend Should put non-user interacting applications and the database into the a single container.

## 5.6 Backend Software

Backend Software SHALL be written in the most current stable version of the Go language.

Go Software Responsibilities:
expose REST API
handle auth, validation, routing
start Neo4j transactions
expose /metrics for Prometheus
emit OpenTelemetry traces/metrics/logs
Typical internal connections:
to Neo4j on neo4j:7687
to OTel collector on otel-collector:4317 or 4318

### 5.6.1 Backend Database

The backend Database SHALL be the latest stable Neo4j Community Edition.

Responsibilities:
persist graph data
provide ACID transactions
accept Bolt protocol connections from backend

Typical internal connection:
Go backend -> neo4j:7687
Do not expose Neo4j publicly.

### 5.6.2 Telemetry



The backend SHALL use Open Telemetry Collector for backend telemetry



Responsibilities:



receive telemetry from backend

batch/process telemetry

export traces to Tempo

optionally expose Prometheus-scrapable metrics or forward OTLP metrics





Typical flow:



Go backend -> OTel Collector -> Tempo/Jaeger





### 5.6.3 Metrics



The backend SHALL use Prometheus for metrics.



Responsibilities:

scrape /metrics endpoints

store time-series metrics

answer PromQL queries from Grafana





Typical scrape targets:



backend:8080/metrics

otel-collector metrics endpoint



optionally Neo4j exporter if you add one





### 5.6.4 Traces



The backend SHALL use Tempo.



Responsibilities:

store distributed traces

let Grafana drill into request traces





Typical flow:



OTel Collector -> Tempo/Jaeger

Grafana -> Tempo/Jaeger





### 5.6.5 Dashboard



The backend SHALL use Grafana.



Responsibilities:

display metrics dashboards

display traces

correlate slow requests with backend metrics





Typical data sources:

Prometheus

Tempo



Grafina SHALL present an accessible dashboard via the reverse proxy



### 5.6.6 Backend API Requirements



The Backend SHALL expose a REST API to support all Frontend and tool interactions.



\---



#### 5.6.6.1 General Requirements

•	The API SHALL use HTTPS

•	The API SHALL return JSON

•	All endpoints SHALL support concurrent access

•	All write operations SHALL be transactional

\---



#### 5.6.6.2 Node Retrieval



The Backend SHALL provide endpoints for node lookup:

•	Retrieve node by HID

•	Retrieve node by uuid

•	Retrieve node by type



Responses SHALL include:

•	All node properties

•	HID

•	uuid

•	TypeName

•	Containing SoI

\---



#### 5.6.6.3 Hierarchy Retrieval



The Backend SHALL provide:

•	Full system hierarchy (Capability → Systems)

•	Parent-child relationships between Systems



This endpoint SHALL:

•	Support efficient graph rendering

•	Minimize payload size

\---



#### 5.6.6.4 Search



The Backend SHALL support search queries across nodes.



Search SHALL support:

•	HID (exact)

•	uuid (exact)

•	Name (partial)

•	ShortDescription (partial)

•	Node Type filtering



Search results SHALL include:

•	Node metadata

•	Containing SoI

•	Node type

\---



#### 5.6.6.5 Relationship Validation



The Backend SHALL validate relationships before creation.



Validation SHALL:

•	Confirm allowed node types

•	Enforce relationship rules

•	Prevent invalid associations



The API SHALL return:

•	Valid / invalid

•	Reason for invalidity

\---



#### 5.6.6.6 Context Retrieval



The Backend SHALL provide context for any node:

•	Containing (:System)

•	Path within hierarchy

•	Parent relationships

\---



#### 5.6.6.7 Performance Requirements



The Backend SHALL:

•	Use indexes on:



•	HID

•	uuid

•	Name

•	TypeName



•	Provide optimized queries for:



•	hierarchy traversal

•	search operations

\---



#### 5.6.6.8 Transaction Requirements

•	All mutations SHALL be ACID compliant

•	Relationship creation SHALL be atomic

•	Validation SHALL occur prior to commit

\---



##### 5.6.6.8.1 Ownership and Change Notification Requirements



The Backend SHALL determine the set of affected nodes for each commit.

Affected nodes SHALL include:

any node whose property values changed

both endpoint nodes of any created relationship

both endpoint nodes of any removed relationship



For each affected node, the Backend SHALL compare the current user with the node Owner.

If the current user is not the Owner, the Backend SHALL create a CHANGE_NOTIFICATION message addressed to that Owner.

A single commit MAY generate multiple messages.

The Backend SHOULD aggregate multiple changes for the same Owner within one commit into a single message.

Each change-notification message SHALL include:

Subject

Sent timestamp

Sender

Recipient

affected HID or HIDs

change type summary

old owner and current owner where ownership changed

commit identifier



Message creation SHALL occur in the same ACID transaction as the graph mutation.



If the data mutation succeeds, required messages SHALL also succeed.



If required messages fail, the entire transaction SHALL roll back.



The current version SHALL notify only through internal mailbox messaging.



Future attachment to organization email exchange SHALL be supported through an integration boundary and SHALL NOT change the internal mailbox requirement.



\---



##### 5.6.6.8.2 Ownership Change Rules



Any user MAY change ownership in the current version.



Ownership change SHALL itself generate a notification to the prior Owner when performed by a different user.



Ownership change SHALL update Owner, OwnerEmail, and LastTouch.



Ownership change SHALL NOT modify Creator or CreatorEmail.



\---





#### 5.6.6.9 Security (Placeholder)



The Backend SHALL support:

•	User identification

•	Role-based access (future implementation)



#### 5.6.6.10 External Reference Framework API Requirements



The Backend SHALL expose REST API endpoints to support import, retrieval, search, navigation, inspection, and assignment of external reference framework data.



All write operations SHALL be transactional, consistent with existing Backend API requirements.



#### 5.6.6.11 Messaging API Requirements



Include endpoints such as:



GET /api/messages

GET /api/messages/{messageId}

POST /api/messages

POST /api/messages/{messageId}/reply

POST /api/messages/{messageId}/read

DELETE /api/messages/{messageId}

GET /api/messages/unread-count



Response requirements:



list view returns subject, datetime, HID summary, sender, message type, read/unread

detail view returns full body plus related HIDs and reply chain

list query SHALL support sort by subject, datetime, HID, and sender

list query SHALL support ascending and descending order

\---





##### 5.6.6.11.1 Framework Import Requirements



The SSTPA Development System SHALL provide import tools for:

•	NIST SP 800-53r5
•	MITRE ATT\&CK
•	MITRE EMB3D



The import process SHALL:

•	Convert source data into graph format
•	Preserve framework version information
•	Preserve source identifiers
•	Preserve hierarchy and related-item relationships where supported by the source data
•	Avoid creating duplicate imported reference items for the same framework version and source identifier

The Backend SHALL support converted data set.

#### 5.6.6.12 Model Translation API Requirements

The Backend SHALL expose the translators of Section 3.7 through the
following endpoints:

* GET /api/model/sysml?scope={CAPABILITY|SOI|NODESET}&soi={HID}&nodes={HIDs}
— returns SysML 2.0 textual notation for the SYSML-domain content of the
scope.
* GET /api/model/kerml?scope=…&soi={HID}&nodes={HIDs}
— returns KerML 1.0 textual notation for the KERML-domain content of the
scope (analysis package).
* GET /api/model/profile — returns the SSTPA Profile Library text and its
version.
* POST /api/model/validate {language, text, soiHID, toolID, allowDelete}
— parses and validates per Section 3.7.9; returns diagnostics and the
staged change-set summary; mutates nothing.
* POST /api/model/commit {language, text, soiHID, toolID, allowDelete}
— executes the validated change set through the standard Commit pipeline;
returns the standard Commit result including ownership-notification
outcomes.

Capability-discovery (Section 6.4) SHALL advertise: model.translate.read,
model.translate.write, model.profile.read.

All endpoints SHALL enforce the Engineering Translation Set exclusions
(Section 3.7.2), tool authority (Section 3.7.9), and the performance limits
of Section 3.7.11.




## 5.7 Docker networks


Backend should use at least two Docker networks, an edge network and a backend network.


### 5.7.1 Edge Network


For public-facing traffic.

Members:

caddy
grafana (proxy publishes dashboards)


### 5.7.2 backend Network

For internal service-to-service traffic.

Members:

caddy
backend
neo4j
otel-collector
prometheus
grafana
tempo


So the proxy sits on both networks:
on edge to accept external traffic on backend to forward internally Everything else sits only on backend.


### 5.7.3 Security model

The backend architecture should give the following defaults:

Publicly exposed
443 on reverse proxy
maybe 80 for redirect to 443





Internal only

backend 8080

Neo4j 7687

Prometheus 9090

Grafana 3000 unless intentionally proxied

Tempo/Jaeger ports

OTel Collector ports





### 5.7.4 Docker Compose Topology

Docker Compose should have a Docker Compose-style topology aligned to below:



services:

* caddy:
* image: caddy:latest
* ports:
* 
* "80:80"
* 
* "443:443"
* networks:
* 
* edge
* 
* backend
* depends_on:
* 
* backend







* backend:
* image: my-backend:latest
* networks:
* 
* backend
* depends_on:
* 
* neo4j
* 
* otel-collector







* neo4j:
* image: neo4j:community
* networks:
* 
* backend
* volumes:
* 
* neo4j-data:/data







* otel-collector:
* image: otel/opentelemetry-collector:latest
* networks:
* 
* backend







* prometheus:
* image: prom/prometheus:latest
* networks:
* 
* backend







* tempo:
* image: grafana/tempo:latest
* networks:
* 
* backend







* grafana:
* image: grafana/grafana:latest
* networks:
* 
* backend







networks:

* edge:
* backend:



volumes:

* neo4j-data:



Backend SHALL allow display and configuration of ports, configs, and volumes

Backend SHALL send configuration information to Frontend or Startup on connection





### 5.7.5   Backend Telemetry

Request flow



1. Client sends HTTPS request to api.example.com
2. Caddy terminates TLS
3. Proxy forwards to backend:8080
4. Backend authenticates request
5. Backend starts trace/span
6. Backend opens Neo4j transaction
7. Neo4j commits/rolls back
8. Backend returns JSON response
9. Proxy returns HTTPS response



Telemetry flow



1. Backend records request counter + latency histogram
2. Backend creates OpenTelemetry spans
3. Prometheus scrapes /metrics
4. OTel Collector receives spans
5. Collector exports traces to Tempo
6. Grafana queries Prometheus and Tempo
7. Operator sees metrics + traces together





# 6 Frontend

The Front end includes the Graphic User Interface (GUI) and Add-on Tools.  The GUI will have a formal Add-on Tool Extension Architecture to allow dynamic loading of Add-on Tools at startup.  It also connects to the Backend which serves as its datastore.



The purpose of the GUI is to allow the User to inspect and edit all data in the Core Data Model.  The GUI presents s single System of Interest (SoI) which can be changed via the Navigator Tool.

The purpose of the Add-on Tools is to provide the User with utilities to perform System Security Analysis in a manner which is as minimally prescriptive as possible.  Of all tools, the Navigator Tool is essential to the proper functioning of the GUI.  Message Center provides the capability for Users to communicate and acts to enforce the data ownership model.  The remainder of the Add-on Tools support Systems Engineering analysis and design.



Add-on Tools work with the GUI as an intuitive interface.  All Add-on Tools are initialized through button press on the Control Bar which will not be covered over and remain accessible with a GUI Data Drawer open. When a Data Drawer is open, this acts as input to the Add-on Tool to set the mode and focus of the specific tool.



The GUI SHALL utilize Backend API endpoints.



## 6.1  Frontend UI Tech Stack

Core stack

•	Tauri

•	React

•	TypeScript

•	Vite

•	Tailwind CSS



UI behavior

•	Headless UI or Radix primitives style component approach

•	Framer Motion for expand/collapse and drawer animations



Data/state

•	Zustand for UI state

•	TanStack Query for backend fetch/mutate/cache



Large-list performance

•	react-virtual for long nested card sections



Graph visualization

•	Cytoscape.js for SoI graph selection popup

•	Do not use the graph library for the main editor surface



Recommended Cytoscape ecosystem:

•	cytoscape

•	react-cytoscapejs

•	layout plugin such as:

•	cytoscape-fcose for force-directed layouts

•	optionally dagre-style layout if you want a clearer top-down hierarchy mode

•	cytoscape-cose-bilkent is also worth considering for stable medium-sized graphs





Optional effects

plain CSS for restrained translucent surfaces, engraved border treatments, drafting-grid background cues, and reduced-motion-compatible transitions.



AG Grid only for:

•	Requirements Traceability Matrix

•	search results

•	report tabulations


## 6.2  GUI Overview


The core of the Frontend is the "GUI".  As the principal user facing component it will be branded as "SSTPA Tools".

The GUI SHALL execute as a stand alone desktop application.

The GUI SHALL operate in a single window with the capability to execute add-on tools in pop-up windows

The GUI SHALL connect to the Backend and commit data only after commit confirmation in a confirmation dialog.



### 6.2.1  GUI Style

The GUI SHALL have a style defined by a stylesheet file with a default style and user-selectable alternate styles.

The GUI SHALL be organized in panels.


The GUI SHALL use only free and open-source fonts that may be bundled with the product or installed with the application without commercial font licensing.


### 6.2.2  Default_Style.css file

The `sstpa-default.css` file SHALL be the single default UI stylesheet used by the GUI and by all Add-on Tool shells.

`sstpa-default.css` SHALL define shared design tokens for:

* color,
* typography,
* spacing,
* borders,
* radius,
* shadow,
* motion,
* panel layout,
* drawer layout,
* graph and diagram styling,
* node type visualization,
* alert states,
* accessibility states.



#### 6.2.2.1 Typography

All default GUI fonts SHALL be free and open-source fonts suitable for bundling with SSTPA Tools.

The build pipeline SHALL package or otherwise make available the approved font files for air-gapped deployments.

The GUI SHALL fall back to platform fonts when bundled font files are unavailable, but the default distribution SHALL NOT depend on proprietary or commercially licensed fonts.

Approved default fonts are:

* Source Sans 3 for primary UI text,
* Cormorant SC for branding and major headings,
* JetBrains Mono for technical identifiers.



## 6.3  SSTPA GUI Main Window

The SSTPA Tools GUI will consist of a single window composed of four Panels; the Branding Panel, The Control Panel, the System Panel and the Main Panel.  The Main Panel will use a data drawer technique to access and manipulate data but this will only obscure the Main Panel leaving all other panels accessible.





### 6.3.1  SSTPA Tools branding Panel

The Branding Panel SHALL be the strongest expression of the SSTPA Tools visual identity.

The Branding Panel SHALL use the SSTPA Tools logo palette, deep navy typography, ivory surface color, and restrained Art Nouveau border framing.

The Branding Panel SHALL avoid high-saturation neon effects.

Backend connection status SHALL remain displayed in a monospaced free/open-source font, preferably JetBrains Mono.



The top Panel of the SSSTPA Tools GUI SHALL show SSTPA Menu bar Logo on top left with "SSTPA Tools" name and version at center.

right SHALL contain status information from Backend in smaller font to include connection IP, port and connection status (in Courier font and a contrasting color). In the right it SHALL also show the current User name, mail Icon titled "Message Center" (an add-on Tool) and a gear Icon for changing GUI parameters such as changing Style and displaying license, and system version information.

The GUI Branding Panel SHALL host Add-on Tool icons from the left of the Gear Icon.





## 6.3.2  SSTPA Control Panel

The SSTPA Control Panel SHALL be below the SSTPA Branding Panel and contain icons for Add-on Tools starting from the Left going full width to the right.



The SSTPA Control Panel SHALL present an ICON for 'Shutdown" at the far right of the panel as a typical power icon but in red color.

The SSTPA Control Panel SHALL scale Add-on Tool icons such that there is visual separation between the Add-on Tool Icons and the "Shutdown" Icon.



The SSTPA Control Bar SHALL remain visible and accessible when the GUI Data Drawer is open.

Add-on Tools SHALL be displayed in a Pop-up Window which is resizable by the User  with the SSTPA Tool Menu bar Logo below the banner bar on the left.

Add-on Tools SHALL and takes as input the status and current node displayed in the Data Drawer.



If User selects a menu item or icon which does not have real functionality attached, it SHALL present an alert dialog titled "Under Construction" with a construction icon and an "OK" button.  On click of the "OK" button, the alert will close.







### 6.3.3 System of Interest Panel

The SSTPA System of Interest Panel SHALL be below the SSTPA Control Panel.

Data presented in the System of Interest Panel SHALL be not editable.  The user will be able to edit data in the associated data drawer.  Data in this panel will be updated when new data from the data drawer is committed.



If there is no current System of Interest (SoI) selected, the panel SHALL present  (:Project) and display the Root at top center "Select a System of Interest".



The SSTPA Tools System of Interest Panel SHALL display SoI properties: HID, Name and ShortDescription.



The SSTPA Tools System of Interest Panel SHALL display an "Edit" icon which on-click SHALL open all system properties in Data Drawer.



Using the System of Interest Panel the User will be capable of navigating the entire hierarchical structure of the project.

The SSTPA Tools System of Interest Panel Shall display Icons for all Children of the current SoI.  On Click, the selected child will become the current SoI.

The SSTPA Tools System of Interest Panel SHALL display an up pointing arrow as an Icon.  on click the GUI SHALL cause the parent of the current SoI to be the new SoI.





### 6.3.4  Main Panel

The intent for the Main Panel is to present enough information on Nodes in the SoI to allow the user to open a Data Drawer to edit them. It will be organized by Primary Node Types each specific Node within the Type grouping can expand to show its Secondary Node relationships with the capability to edit those nodes.  This extends though the ability of each secondary node to expand to expose tertiary nodes.



The Main Panel SHALL present all data for the currently selected System of Interest (SoI) using a hierarchical, single-window card interface with progressive disclosure.



Main Panel cards SHALL use architectural drafting-card styling rather than aggressive tilt-card or cyberpunk-card styling.

Cards SHALL use ivory surfaces, navy linework, restrained double-line borders, subtle inset highlights, and clear information hierarchy.

Card ornamentation SHALL be limited to borders, section dividers, badges, and corner treatment.





#### 6.3.4.1  Main Panel Wireframe



#### 6.3.4.2 Structure



The Main Panel SHALL be organized into collapsible Node Type Sections (Primary Types):

• Environment

• Connection

• Interface

• Function

• Element

• Purpose

• State

• Views

• Asset

• Security



When the Security section is expanded, it SHALL disclose related (:SecurityControl) and (:Countermeasure) nodes through their relationship groups



Each Node Type Section SHALL:

•	Display the Node Type name and count

•	Include an Add button for creating a new node of that type

•	Support expand/collapse behavior



#### 6.3.4.3 Primary Entity Cards



Within each Node Type Section, individual entities SHALL be displayed as cards.



Each card header SHALL display:

•	HID

•	Name

•	ShortDescription

•	Node Type badge



Each card SHALL include actions:

•	Expand / Collapse

•	Edit (opens Data Drawer)

•	Delete (with confirmation)



#### 6.3.4.4 Relationship Groups (Nested)



When a card is expanded, it SHALL display Relationship Groups corresponding to its outgoing relationships.



Each Relationship Group SHALL:

•	Display the relationship name and count

•	Be collapsible

•	Include buttons:

•	Add (create new related node)

•	Associate (link existing node)



For State cards, the TRANSITIONS_TO relationship group SHALL distinguish transitions by TransitionKind so the user can visually identify functional transitions, countermeasure-required transitions, and transitions serving both roles.





#### 6.3.4.5 Secondary and Tertiary Entity Cards



Within each Relationship Group, related entities SHALL be displayed as cards.

•	Secondary entity cards MAY expand to show their own relationship groups (tertiary level)

•	This pattern SHALL recursively apply to all supported hierarchy levels



#### 6.3.4.6 Repeated Entity Representation



An entity MAY appear multiple times in the Main Panel when related to multiple parent entities.



Requirements:

•	All instances SHALL reference the same underlying node (via HID and uuid)

•	Editing any instance SHALL update the single underlying node

•	Each instance SHALL display its HID to preserve identity clarity



#### 6.3.4.7 Visual Density Controls



To manage complexity, the UI SHALL support:

•	Expand/Collapse at all levels

•	Lazy loading or virtualization for large lists

•	Display of counts for collapsed sections





#### 6.3.4.8  Node Deletion

Node deletion is complex as the consequence of a user mistake are grave and the potential for unintended cascade is high.  Therefore the following Node Deletion rules are established.



All Node deletions SHALL follow an alert / confirm pattern.



When a Node is deleted other than a (:System) or (:Component) node parenting a (:System) node, the GUI SHALL identify all nodes within the SoI which are orphaned by this action and include this notification in the Alert/Confirm Dialog.  If there are any orphaned nodes, the Alert / Confirm dialog SHALL include a warning:  "WARNING:  Cancel and Re-Associate the Following Nodes or They will be Deleted".



Node deletion SHALL NOT automatically cascade outside the current SoI.



Deletion of (:System) Nodes SHALL require explicit user confirmation and preview.





### 6.3.5  Main Panel Data Drawer

The right-side Data Drawer SHALL be the single edit surface for the GUI and will implicitly validate node associations.  Note; Add-on Tools may also allow edit and commit but this is in a pop-up window outside the GUI.

The Data Drawer SHALL use the default Art Nouveau frame treatment and SHALL visually resemble a precision engineering folio.

The Data Drawer SHALL use ivory surfaces, navy typography, structured property groups, and restrained separator linework.

The Data Drawer SHALL preserve high readability for long property lists and SHALL NOT use decorative effects inside editable fields.



All node associations SHALL be validated via Backend API prior to commit.



#### 6.3.5.1 Data Drawer Wireframe



#### 6.3.5.2 General Behavior

•	The Data Drawer SHALL slide in from the right side of the GUI but SHALL not obscure or de-activate the Branding Panel or the Control Panel.

•	Only one Data Drawer SHALL be open at a time

•	It should not be possible to open another data drawer while one is already open

•	A Drawer may be exited through "Commit" of its contents or "Close" or "Cancel" without save

•	Opening a new node SHALL replace the current drawer content



#### 6.3.5.3 Header



The top of the Data Drawer SHALL display:

•	Node Type

•	Node Name

•	HID



It SHALL include:

•	Commit button

•	Cancel button

•	Close (X) icon



#### 6.3.5.4 Property Groups



Properties SHALL be grouped and displayed vertically:

•	Common Properties

•	Type-specific Properties



Each group SHALL:

•	Be collapsible (roll up/down)

•	Allow editing of editable fields only



All empty values SHALL be displayed as "Null".





#### 6.3.5.5 Relationship Groups in Drawer



The Data Drawer SHALL also display relationship groups for the selected node. These will be below the Type-specific properties.



Each Relationship Group SHALL:

•	Show related nodes (HID, Name, ShortDescription)

•	Include actions:

•	Add (create new related node)

•	Associate (link existing node)

•	Remove relationship



For (:State)-[:TRANSITIONS_TO]->(:State) relationships, the Data Drawer SHALL display relationship properties including TransitionKind, Trigger, GuardCondition, Rationale, and any associated Countermeasure HID/uuid traceability fields.


Selecting "Add" a related or "Create" a related node SHALL open that node in the Data Drawer only after displaying the "Commit" dialog allowing the user to commit the current data in the drawer before closing it.  "Cancel" will have the effect of canceling the create related or add related node action.


When Removing relationship is selected, the effected node SHALL be assessed if relationship removal leaves it an orphan.  If the node is not an orphan, the relationship can be safely removed and the change is made when the Data Drawer is committed.  If the Node will become an orphan when the relationship is removed, it SHALL be treated as a deleted node subject to the same alert/confirm prior to the "Commit".


#### 6.3.5.6 Editing Model

•	All edits SHALL be staged in the Data Drawer

•	Changes SHALL be persisted only after Commit is confirmed

•	Commit SHALL trigger validation and backend update



Data Drawer / commit insertion



#### 6.3.5.7 Commit Notification Behavior

On Commit confirmation, the Frontend SHALL submit the staged delta to the Backend.


The Frontend SHALL not independently determine final ownership notification recipients.


The Backend SHALL determine affected owners and generate required messages.


If the commit will modify nodes not owned by the current user, the confirmation dialog SHOULD display a notice stating that owner notification messages will be generated.



The commit response SHOULD include a summary:

nodes changed

relationships changed

number of messages generated

recipients notified



If owner notification generation fails, the Frontend SHALL display the overall commit failure and no staged changes treated as committed.





#### 6.3.5.8 Navigation



The Data Drawer MAY support:

•	Navigation between related nodes

•	Breadcrumb display of relationship context



Navigation in SSTPA Tools is through the SoI Navigator.  Navigation within a Data Drawer to related nodes within the SoI is allowed.  When displaying relationships outside the SoI (for (:Interface) and (:Component) nodes) attempts to edit a node outside the SoI SHALL be responded with an Alert dialog with the Message "Navigate to:  " n.HID " to edit".  The HID for the node SHALL be copiable via icon to allow pasting into the SoI Navigator.



\---



## 6.4  Add-on Tool Extension Architecture

Add-on Tools help users to create, analyze, edit and relate data in a specific context.
Add-on Tools SHALL be integrated through a manifest-based extension architecture.
Each Add-on Tool SHALL provide a Tool Manifest defining:

* ToolID
* ToolName
* ToolVersion
* ToolType
*   ModelTextLanguages
* LaunchLocation
* SupportedNodeContexts
* RequiredBackendCapabilities
* RequiredPermissions
* MutatesData
* ChangesCurrentSoI
* SupportedExportFormats
* MinimumSRSVersion
* ToolEntryPoint


The GUI SHALL discover available Add-on Tools from registered Tool Manifests at startup.
The GUI SHALL render Control Panel buttons, menu entries, and Data Drawer launch actions based on Tool Manifest content.
The GUI SHALL NOT require source-code changes to display, launch, or hide an Add-on Tool whose manifest conforms to this SRS.
Each Add-on Tool SHALL execute in an isolated pop-up window or panel managed by the GUI shell.


Each Add-on Tool SHALL receive a Tool Launch Context object from the GUI containing:

* current User identity
* current SoI HID and uuid
* active Data Drawer node HID and uuid, if any
* launch mode
* Backend API base URL
* read-only or edit-authorized status
* active GUI theme token set

An Add-on Tool SHALL only access the Neo4j database through the GUI.

An Add-on Tool SHALL retrieve, validate, mutate, and commit data only through the GUI using the same staged-edit and Commit confirmation model .

The Backend SHALL remain authoritative for:

* graph schema validation
* relationship validation
* SoI boundary enforcement
* HID and uuid assignment
* ownership and notification behavior
* ACID transaction control
* recursive traversal bounds
* duplicate relationship prevention

An Add-on Tool SHALL not create new Core Data Model node labels, relationship types, or relationship directions unless those extensions are first specified in the SRS and implemented by the Backend.

The GUI SHALL support installation, enabling, disabling, and removal of Add-on Tools by manifest registration without requiring changes to existing Add-on Tool source code.

If a Tool Manifest declares a Backend capability that is unavailable, the GUI SHALL display the tool as unavailable and provide the reason to the User.

The Backend SHALL expose a capability-discovery endpoint allowing the GUI and Add-on Tools to determine supported API versions, endpoint availability, schema version, and feature flags.

Add-on Tools SHALL be versioned independently from the GUI, provided their declared Tool API version is compatible with the installed GUI and Backend.

The GUI SHALL provide a common Add-on Tool shell including:

* title/header area
* current SoI display
* invoking node display, when applicable
* Commit, Cancel, Close behavior
* error display
* Backend validation result display
* theme styling
* telemetry hooks
* Model Text Panel (Section 6.4.2), when the Tool Manifest declares one or
more ModelTextLanguages

Add-on Tool Manifest Schema:

{

* "ToolID": "sstpa.requirements",
* "ToolName": "Requirements Tool",
* "ToolVersion": "1.0.0",
* "ToolType": "GRAPH_ANALYSIS",
* " ModelTextLanguages: [KerML]",
Permitted values: `"SYSML"`, `"KERML"`; an empty array means the tool has no
Model Text Panel (Message Center, Admin Tool)
* "LaunchLocation": ["CONTROL_PANEL", "DATA_DRAWER"],
* "SupportedNodeContexts": [
* "Capability",
* "Requirement",
* "Connection",
* "Element",
* "Interface",
* "Function",
* "Constraint",
* "Countermeasure"
* ],
* "RequiredBackendCapabilities": [
* "node.lookup",
* "requirement.hierarchy.read",
* "relationship.validate",
* "graph.mutate.transactional"
* ],
* "MutatesData": true,
* "ChangesCurrentSoI": false,
* "SupportedExportFormats": ["PNG", "SVG"],
* "MinimumSRSVersion": "0.5.7",
* "ToolEntryPoint": "tools/requirements/index.html"

}



### 6.4.1  Add-on Tool Style

Each Add-on Tool SHALL consume the active GUI theme token set.
Each Add-on Tool SHALL use `sstpa-default.css` or the active alternate stylesheet unless the Add-on Tool has an explicitly approved visual exception.
The common Add-on Tool shell SHALL provide shared theme classes for title/header area, current SoI display, invoking node display, Commit/Cancel/Close controls, error display, validation result display, and graph or diagram canvas areas.
Add-on Tools SHALL preserve the default theme's typography, color tokens, focus indicators, reduced-motion behavior, and accessibility behavior.

Add-on tools SHALL use the default theme's graph and diagram tokens for canvas color, node fills, node strokes, edge strokes, selection state, hover state, valid/invalid state, and muted state.
Add-on tools SHALL use shape, color, stroke treatment, line style, and label treatment for semantic distinction.
Add-on tools SHALL NOT use decorative Art Nouveau ornamentation inside graph nodes where it could interfere with diagram interpretation.
Graph frames, legends, side panels, and tool headers MAY use restrained Art Nouveau framing consistent with `sstpa-default.css`.


### 6.4.2 Model Text Panel

Each Add-on Tool whose manifest declares one or more ModelTextLanguages
SHALL include a Model Text Panel provided by the common Add-on Tool shell.

Layout and behavior:

* The panel SHALL be docked to the right edge of the tool window,
collapsible to a labeled tab, and resizable. Collapse state and width SHALL
persist per tool per User.
* When the manifest declares both SYSML and KERML, the panel header SHALL
provide a language selector; the default language follows the selected
node's Model Domain (Section 3.3.3).
* The panel SHALL display G2M output (Sections 3.7.5–3.7.8) for the tool's
current scope: the tool's primary diagram scope by default, or the current
selection when the User enables Selection Scope.
* Selection synchronization SHALL be bidirectional: selecting a canvas
element highlights its text range; placing the cursor in an element's text
highlights the canvas element.
* Text SHALL be rendered in the monospace font of Section 6.2.2.1 with
keyword highlighting and theme tokens (Section 6.4.1).

Editing:

* The panel SHALL be read-only by default. An Edit toggle SHALL be enabled
only when the Tool Launch Context grants edit authorization and the Backend
advertises model.translate.write.
* Entering text Edit mode SHALL freeze canvas staging for the tool, and
vice versa; a single Commit SHALL never merge canvas-staged and text-staged
changes.
* Edited text SHALL be validated through POST /api/model/validate
(debounced); diagnostics SHALL display inline at line/column with the rule
identifier.
* Commit of text edits SHALL use the tool's standard Commit control and the
standard staged-diff confirmation, executing POST /api/model/commit.
* M2G tool-authority rules (Section 3.7.9) apply: the panel can stage only
mutations its host tool is authorized to make.

Export:

* The panel SHALL provide Copy and Export actions producing .sysml or
.kerml files; tools with a Model Text Panel SHALL add "SYSML" / "KERML" to
their SupportedExportFormats.

Performance:

* Panel render for a 1,000-element scope SHALL complete in under 500 ms
after G2M response receipt.



## 6.5 Add-on Tools

\---



### 6.5.1 The Navigator Tool

#### 6.5.1.1 Tool Purpose

Navigator Tool allows the User to traverse the project hierarchy and move laterally to other projects, examples and sandboxes owned by the User.  It allows selection of the current SoI and selection of a node not in the current SoI to clone into the current SoI.  The User will have the option of also pulling into the current SoI all (:Requirement) nodes associated with the cloned node.  These will of course receive new IDs but it will be the User's responsibility to tailor the requirement text if this option is chosen.  In addition, it allows the User to visualize the project hierarchy at any tier or along any branch to a selected tier depth.  It can capture images of this perspective as a graphics image and export it.

The Navigator Tool is essential to the function of the GUI and SHALL be displayed in the Control Panel at twice the width of other Add-on Tool buttons and always located in upper left of the Tools panel.
The "Navigator Tool" will perform the following core functions:
It is the means by which he SSTPA Tools GUI User Selects a System of Interest (SoI) for the rest of the GUI
It allows the User to search the entire Hierarchy to identify specific nodes and display it graphicly
It allows the User to explore the System Hierarchy while not changing the current SoI
It allows the Use to navigate to and select a node from another System to clone into the current SoI
It allows the User to select a (:Connection) node owned by another System and connect an SoI (:Interface) to it
User can set Navigator Tool to display participants and owner in a specific (:Connection) and graphically visualize selected connections up to all of them.


The tool described here SHALL be branded at top of window as "Navigator Tool"


The Navigator Tool SHALL:

•	place (:Project) at the top or central anchor position
•	display connected (:System) nodes using force-directed or constrained hierarchical layout behavior
•	support smooth zoom, pan, and animated re-centering
•	preserve visible spatial continuity during user interaction
•	prevent navigation states where all nodes are moved completely out of view



#### 6.5.1.2 Tool Wireframe



#### 6.5.1.3 Invocation
On icon click


#### 6.5.1.4 Supported Node Context
Navigator Tool may be involked at any time even if no current SoI is selected.


#### 6.5.1.5 Modes of Operation

The Hierarchy Search Tool SHALL support four modes:


a. SoI Selection Mode

•	Allows selection of a (:System) node as the current SoI
•	On confirmation, the selected node SHALL become the current SoI
•	All GUI panels SHALL update to reflect the new SoI



b. Association Selection Mode

•	Allows selection of nodes outside the current SoI for association
•	SHALL NOT change the current SoI
•	SHALL return the selected node to the calling context


Use cases include:

•	User clones a single node from another system into the curent SoI
•	(:Interface)-[:PARTICIPATES_IN]->(:Connection) association where (:Connection) belongs to another SoI.
•	(:Requirement)-[:PARENTS]->(:Requirement) association
•	Other cross-SoI associations as defined by relationship rules

c. Search / Locate Mode

•	Allows users to locate nodes across the hierarchy

•	SHALL support search by:

•	HID
•	uuid
•	Name
•	ShortDescription
•	Node Type

•	SHALL allow selection, centering, and optional action based on context


d.  Clone Node

The Navigator Tool SHALL provide a Clone Mode enabling duplication of either:

1. A single node with no retained relationships ("Clone Node")
2. A single node with all [:HAS_REQUIREMENT] relationships only ("Clone Node With Requirements")


1). Clone Node (Properties Only, No Relationships)

This operation SHALL duplicate a single node with no retained relationships.

---

Behavior

•	The selected node SHALL be cloned with:
•	All properties copied
•	No inbound relationships retained
•	No outbound relationships retained

---

Insertion Behavior

•	The cloned node SHALL be attached to a user-selected parent node using a valid relationship defined in the Core Data Model

---


Validation Rules

•	The selected parent MUST support the relationship type per Core Data Model rules
•	Invalid parent nodes SHALL be visually disabled
•	Clone execution SHALL be blocked until a valid parent is selected

---


Identity Rules



The cloned node SHALL receive:

•	New uuid
•	New HID Index of the destination SoI
•	New sequence number assigned per node-type rules

\---



Relationship Rules

•	Exactly one relationship SHALL be created:
•	Between the selected parent node and the cloned node
•	No other relationships SHALL exist on the cloned node

\---


General Clone Mode Requirements

•	The user SHALL:
•	Select a source System or node
•	Select clone type
•	Select a valid destination System or parent node
•	The tool SHALL:
•	Visually distinguish valid and invalid targets
•	Prevent execution until all validation rules pass

•	Clone operations SHALL NOT:
•	Modify source nodes
•	Create invalid or incomplete graph structures





\---

2). Clone Node with Requirements (Properties Only, Only [:HAS_REQUIREMENT] relationships)



This operation SHALL duplicate a single node with all related requirements with other relationships on the node and its requirements stripped.

This operation SHALL only be made available when cloning nodes having [:HAS_REQUIREMENT] relationships (if no requirements just use 1))



\---



Behavior

•	The selected node SHALL be cloned with:
•	All properties copied
•	No inbound relationships retained
•	No outbound relationships retained except [HAS_REQUIREMENT]


\---



Insertion Behavior

•	The cloned node SHALL be attached to a user-selected parent node using a valid relationship defined in the Core Data Model
•	(:Requirement) nodes cloned SHALL have their Orphan property set to "True"


\---


Validation Rules

•	The selected parent MUST support the relationship type per Core Data Model rules
•	Invalid parent nodes SHALL be visually disabled
•	Clone execution SHALL be blocked until a valid parent is selected

\---



Identity Rules



The cloned node and cloned related requirements nodes SHALL receive:

•	New uuid
•	New HID Index of the destination SoI
•	New sequence number assigned per node-type rules

\---



Relationship Rules

•	Exactly one relationship SHALL be created:
•	Between the selected parent node and the cloned node
•	No other relationships SHALL exist on the cloned node except [:HAS_REQUIREMENT]
•	(:Requirement) nodes cloned SHALL be related to the parent SoI (:Purpose) node such that (:Purpose)-[HAS_REQUIREMENT]->(:Requirement)


\---



General Clone Mode Requirements

•	The user SHALL:

•	Select a source System or node

•	Select clone type

•	Select a valid destination System or parent node

•	The tool SHALL:

•	Visually distinguish valid and invalid targets

•	Prevent execution until all validation rules pass



•	Clone operations SHALL NOT:

•	Modify source nodes

•	Create invalid or incomplete graph structures

\---

#### 6.5.1.6 Hierarchy Visualization



The tool SHALL display a graph-based visualization of the system hierarchy.



Requirements:

•	SHALL display (:Project) and (:System) nodes by default

•	SHALL represent parent-child (:System) relationships directly

•	SHALL NOT display intermediate (:Component) nodes in default view

•	SHALL allow user to roll down primary or primary and  secondary nodes where primary and secondary relationships are depicted as a line

•	SHALL visually resemble:

•	Obsidian Graph View

•	Neo4j Browser graph



The graph SHALL:

•	Support zoom, pan, and animated transitions

•	Maintain visual continuity during navigation

•	Prevent out-of-bounds navigation

\---



#### 6.5.1.7 SoI and Selection Behavior

If no SoI has been selected, the tool SHALL scale to show the full hierarchy.

If an SoI has already been selected, the tool SHALL initially center the graph on the current SoI and visually distinguish it from all other nodes





•	The current SoI SHALL be visually distinct

•	The tool SHALL support a temporary selection independent of the SoI

•	Selecting a node SHALL NOT change the SoI unless explicitly confirmed



Visual distinction SHALL exist for:

•	Current SoI

•	Temporary selection

•	Search results

•	Hover state

•	Valid/invalid selection targets

\---



#### 6.5.1.8 Search and Filtering



The tool SHALL provide a search interface.



Capabilities:

•	exact search by HID

•	exact search by uuid

•	partial search by Name

•	partial search by ShortDescription

•	filtering by node type

•	filtering by current mode-valid node types

•	case-insensitive matching for textual fields

•	optional exact-match toggle

•	optional incremental search while typing





Search results SHALL:

•	Highlight nodes in the graph

•	Be listed in a synchronized results panel

•	Allow selection and graph centering



Exact HID/uuid matches SHALL:

•	Automatically center the graph

•	Automatically select the node



Pattern:

•	global search box sends debounced query

•	backend returns candidate nodes

•	graph recenters and highlights



\---



#### 6.5.1.9 Cross-SoI Association Support



When invoked for association:

•	The current SoI SHALL remain unchanged

•	The tool SHALL display:

•	Source node HID

•	Source node type

•	Intended relationship

•	Only valid target node types SHALL be selectable

•	Invalid nodes SHALL be visually muted



On confirmation:

•	The selected node SHALL be returned to the caller

•	No navigation state SHALL change

\---



#### 6.5.1.10 Node Scope and Expansion



Default scope:

•	(:Project)

•	(:System)



Optional expanded scope MAY include:

•	(:Interface)

•	(:Requirement)

•	Other node types



When enabled:

•	Non-System nodes SHALL be visually attached to their containing (:System)

•	SHALL be toggleable on/off

\---



#### 6.5.1.11 Information Display Controls



Navigator Pop-up Window SHALL be composed of the following elements:

•	HierarchySearchDialog

•	HierarchyGraphPane

•	HierarchySearchPanel

•	SelectionContextHeader

•	NodeInspectorMiniPanel

•	ModeActionBar





The tool SHALL provide toggles for:

•	All HID

•	All Name

•	Selected HID

•	Selected Name

•	Node Type

•	Search highlights



The selected node SHALL always display:

•	HID

•	Name

•	Type

\---



#### 6.5.1.12 Selection Actions



Actions SHALL be mode-dependent:





SoI Selection Mode

•	Select SoI

•	Cancel

•	Close



Association Selection Mode

•	Associate Selected Node

•	Cancel

•	Close



Search Mode

•	Center on Selected

•	Use as SoI

•	Return Selected Node

•	Close



Clone Mode

•	Center on Selected

•	Expand selected (primary or primary and secondary) SoI

•	Select Node to Clone and clone type

•	Select valid parent (dim invalid)

•	Perform clone operation (copy properties, change HID, etc...)

•	Close



Only valid actions SHALL be enabled.



\---



#### 6.5.1.13 Interaction Requirements



The graph SHALL support:

•	Zoom (wheel and controls)

•	Pan (drag)

•	Click selection

•	Hover highlight

•	Animated centering

•	Keyboard navigation

•	Escape to close

\---



#### 6.5.1.14 Performance Requirements



The tool SHALL:

•	Load hierarchy efficiently

•	Render only required nodes initially

•	Support progressive loading for large graphs

•	Maintain UI responsiveness



Exact HID/uuid lookup SHALL be faster than general search.



\---



#### 6.5.1.15 Data Integration Requirements



The tool SHALL retrieve data from the Backend.



Required capabilities:

•	System hierarchy retrieval

•	Node lookup by HID

•	Node lookup by uuid

•	Text search

•	SoI context lookup

•	Relationship validation



The tool SHALL edit nodes only when performing clone functions.



The Navigator Tool SHALL execute all clone operations through Backend API interactions as transactional graph mutations.



\---



Required Backend Capabilities



The Backend SHALL support:

•	Retrieval of:



•	Nodes by HID and uuid

•	SoI membership via HID Index

•	All relationships within a given SoI



•	Validation of:



•	Allowed relationship types

•	Parent-child compatibility

•	Node type constraints

\---



Clone Execution Requirements



All clone operations SHALL:

•	Execute as a single ACID-compliant transaction

•	Perform all validation prior to mutation

•	Fully roll back on any failure

\---



Node Clone Processing Rules



The Backend SHALL:

1. Clone only the selected node
2. Copy all properties
3. Remove all relationships
4. Assign new identity values
5. Create exactly one valid parent relationship

\---



Identity and HID Rules



The Backend SHALL:

•	Generate new uuid values for all cloned nodes



•	Recompute HID values using:



•	Destination SoI Index

•	Node Type Identifier

•	Correct sequence numbering rules



•	Ensure:



•	No HID collisions

•	No sequence conflicts within the destination SoI

\---



Relationship Integrity Rules

•	No cloned node SHALL retain relationships not explicitly allowed by clone type

•	No relationships SHALL be created to nodes outside the destination SoI

•	The resulting graph SHALL conform fully to Core Data Model constraints

\---



Cross-SoI Constraints

•	Clone operations MAY create nodes in a different SoI than the current SoI



•	This behavior SHALL be explicitly allowed as an exception to the Out-of-SoI Editing Constraint



•	Clone operations SHALL NOT:



•	Modify existing nodes in other SoIs

•	Create relationships to existing external nodes

\---



Error Handling



If validation fails, the Backend SHALL return:

•	Failure status

•	Specific reason (e.g., invalid parent, relationship violation, identity conflict)



No partial clone SHALL be committed.



\---



Performance Requirements

•	System clone SHALL efficiently traverse nodes using HID Index

•	Clone operations SHALL scale to large SoIs

•	UI responsiveness SHALL be maintained during execution







\---



#### 6.5.1.16 Out-of-SoI Editing Constraint



Selection of nodes outside the current SoI SHALL NOT allow editing.



If edit is attempted:

•	The GUI SHALL display:

•	"Navigate to: [HID] to edit"





#### 6.5.1.17 Visual Encoding Requirements


Node type representation SHALL be consistent across all modes and sessions.



The Navigator Tool SHALL assign each node type a unique combination of:

•	Shape

•	Fill color

•	Border (stroke) style



Minimum required node representations SHALL include:

•	(:Project): unique shape and color

•	(:System): unique shape and color

•	(:Interface): unique shape and color

•	(:Requirement): unique shape and color

•	All other node types: visually distinct but lower emphasis



Relationship types SHALL be represented using:

•	Line style (solid, dashed, dotted)

•	Stroke thickness

•	Color



Icons SHALL NOT be used to represent:

•	Node type

•	Relationship type

•	Node state

\---



#### 6.5.1.18 Node State Visualization Requirements



The Navigator Tool SHALL visually distinguish node states using non-icon methods such as:

•	Stroke thickness

•	Glow effects

•	Opacity

•	Color variation

•	Animation (subtle, non-distracting)



The following states SHALL be visually distinct:

•	Current System of Interest (SoI)

•	Temporary selection

•	Hover state

•	Search result match

•	Valid selection target

•	Invalid selection target

•	Non-selectable node



Invalid or non-selectable nodes SHALL remain visible but visually muted.



Valid targets SHALL be clearly distinguishable from invalid targets in all modes.



\---



#### 6.5.1.19 Labeling and Text Display



The Navigator Tool SHALL provide independent toggles for:

•	HID labels

•	Name labels

•	Node Type labels



The Navigator Tool SHALL support display modes:

•	No labels

•	Selected node labels only

•	All visible node labels



The selected node SHALL always display:

•	HID

•	Name

•	Type



The tool SHALL implement label collision reduction strategies including:

•	Zoom-based label visibility

•	Truncation

•	Overlap avoidance where feasible

\---



#### 6.5.1.20 Search Results Panel Behavior



The Navigator Tool SHALL include a synchronized Search Results Panel.



Search results SHALL:

•	Display HID, Name, Type, and containing SoI

•	Be sorted by relevance

•	Prioritize exact HID and uuid matches



Interaction requirements:

•	Selecting a result SHALL center and select the node in the graph

•	Selecting a node in the graph SHALL highlight the corresponding result (if present)

•	Results SHALL support incremental loading for large datasets

•	The panel SHALL support a “show more results” mechanism

\---



#### 6.5.1.21 Selected Node Detail Panel



The Navigator Tool SHALL include a Node Detail Panel displaying:

•	HID

•	Name

•	Type

•	uuid

•	Containing SoI

•	ShortDescription

•	Path to root (hierarchy)



The Node Detail Panel SHALL:

•	Update immediately upon selection

•	Provide copy controls for HID and uuid

•	Display mode-relevant actions



The Path-to-Root display SHALL:

•	Show the full hierarchy chain from Capability to selected node

•	Allow user interaction to center any node in the path

\---



#### 6.5.1.22 Minimap and Viewport Controls



The Navigator Tool SHALL include a minimap.



The minimap SHALL:

•	Display the extent of the currently loaded graph

•	Indicate the current viewport

•	Allow click or drag navigation



The Navigator Tool SHALL provide:

•	Zoom controls (in addition to mouse wheel)

•	“Center on selected node” action

•	“Fit graph to view” action

\---



#### 6.5.1.23 Graph Expansion and Scope Control



The Navigator Tool SHALL support controlled expansion beyond default hierarchy view.



Supported view scopes SHALL include:

1. Hierarchy only (Capability + Systems)
2. Hierarchy + primary nodes
3. Hierarchy + primary and secondary nodes



Expansion behavior SHALL:

•	Be user-controlled and reversible

•	Preserve current selection and viewport when feasible

•	Maintain visual attachment of non-System nodes to their containing System

\---



#### 6.5.1.24 Legend Requirements



The Navigator Tool SHALL display a legend.



The legend SHALL describe:

•	Node shapes and colors (by type)

•	Relationship line styles

•	Node state visual treatments



The legend SHALL:

•	Use shape and color only (no icons)

•	Update dynamically if visual encoding changes based on mode or scope

\---



#### 6.5.1.25 Graph Export Requirements



The Navigator Tool SHALL support export of graph visualizations.



Export capabilities SHALL include:

•	PNG format
•	SVG format



The export SHALL support:

•	Current viewport export

•	Full visible graph export



The exported output SHALL preserve:

•	Node shapes

•	Node colors

•	Labels (based on current visibility settings)

•	Relationship styles

\---



#### 6.5.1.26 Layout Stability Requirements



The Navigator Tool SHALL maintain layout stability.



The graph layout engine SHALL:

•	Preserve relative node positioning where feasible



•	Avoid unnecessary full-layout re-computation during interaction



•	Maintain spatial continuity during:



•	Selection

•	Search

•	Expansion

•	Mode switching



The Navigator Tool SHALL support:

•	Force-directed layout mode

•	Hierarchical layout mode



Switching layouts SHALL NOT reset user context unless explicitly requested.



\---



#### 6.5.1.27 Interaction Feedback Requirements



All user actions SHALL provide immediate visual feedback.



The Navigator Tool SHALL:

•	Animate centering transitions

•	Highlight selected nodes clearly

•	Indicate active mode prominently

•	Disable invalid actions visually

\---



#### 6.5.1.28 Reporting and Capture Use Case Support



The Navigator Tool SHALL support use in reporting workflows.



The tool SHALL:

•	Allow users to visually frame portions of the graph

•	Preserve layout and styling in exports

•	Support repeated capture of consistent visual states



#### 6.5.1.29 Model Text Panel

ModelTextLanguages: ["SYSML", "KERML"]. The panel language SHALL follow the
selected node's Model Domain (Section 3.3.3). Scope: the selected node and
its displayed neighborhood (NODESET). The Navigator panel is read-only; all
mutation occurs through the Data Drawer or owning Add-on Tools.


\---





### 6.5.2  The Requirements Tool


#### 6.5.2.1 Purpose
The Requirements Tool is a graphical means for the User to manage all aspects of system requirements.  Users can create (:Requirement) nodes, allocate them, and manage their (;Verification) nodes.  It is also used to assign parentage to one or more (:Requirement) nodes.  It allows the User to graphicly depict (using SysML 2) Requirement Diagrams.  These will show a single requirement and its parentage and legacy to a user defined depth and height.  It can depict any node with a relationship to (:Requirement) within the current SoI and graphicly depict its related (:Requirement) nodes.  It can evaluate the current SoI and identify requirements which are either orphans or barens.  and allow the User to resolve this problem by removal or allocation.  The Requirements Tool contains a utility which assists the User in crafting a proper requirement text.


The Requirement Tool is a graphical add-on tool used to:

•	Visualize (:Requirement) nodes in a hierarchical Tier structure with user selectable depth above and below the selected requirement.
•	Enable structured navigation of requirement parentage and lineage outside the System Hierarchy
•	Display (:Requirement) allocations to valid node types within the SoI
•	Allow user to develop and Allocate requirements to valid nodes.
•	Provide controlled editing, creation, and deletion of (:Requirement) nodes
•	Generate SysML 2 requirement diagrams for analysis and reporting

The tool SHALL be visually and interactively consistent with the Navigator Tool.


#### 6.5.1.2 Tool Wireframe



#### 6.5.2.3 Invocation

The Requirement Tool SHALL:

•	Be launched only from the SSTPA Control Panel
•	Initialize to the Requirements Hierarchy view if a Data Drawer is Active for a (:Requirement) is opened and the Tool will center on that (:Requirement)
•	Initialize to the Requirements Allocation View if a Data Drawer is active for an entity with relationships to (:Requirement) nodes
•	Display Requirements and other entities in a SysML 2 visualization.


In the Hierarchy View, the Requirement Tool SHALL depict the focused requirement and its Heritage and lineage to a User selected depth.


In the Allocation View, the Requirements Tool SHALL depict  the Valid Node with a [:HAS_REQUIREMENT] relationship and all allocated requirements


The User may move between views by, in the Hierarchy View selecting to display Allocations and the User selecting one. or in the Allocation View by the User selecting one Requirement and selecting it for display in Hierarchy View.


\---



#### 6.5.2.4 Supported Node Context


The tool SHALL support invocation for any node with a relationship to (:Requirement).  

The tool SHALL:

•	Load all (:Requirement) nodes associated with the invoking node
•	Display both direct and inherited requirement relationships
•	Shift context on user action
•	Revert back to original context on user action (back arrow)

\---




#### 6.5.2.5 Modes of Operation





#### 6.5.2.6 Requirement Hierarchy Model (Tier System)



The Requirement Management Tool SHALL represent requirements in hierarchical tiers.  All (:Requirement) Nodes belonging to the same sub-graph (:System) as defined by HID Index will have the same tier.  Tier number is the distance between the sub-graph and the (:Project) such that:

•	Tier 0 → (:Project)-level requirements
•	Tier 1 → (:Requirement) in a sub-graph whose (:System) is a direct child of (:Project)
•	Tier 2 → (:Requirement) in a sub-graph whose (:System) is a direct child of an (:Component) in a sub-graph whose (:System) is a direct child of (:Project)
•	Tier N → (:Requirement) where N is the number of sub-graph relationships to :(Capability)


The tool SHALL:

•	Determine tier level based on parent-child relationship count to :(Capability)

•	Support cross-SoI parentage relationships (note:  parent-child relationships between requirements may cross tier boundaries e.g. a Tier 5 requirement could parent a Tier 4 requirement if that other requirement were in another sub-graph.  This behavior is bad practice, but does happen in large complex systems and will be allowed so long as the two SOI's common ancestor is of a lower tier then both of them (prevents one parenting an ancestor).

•	Display tiers visually in structured layout

\---



#### 6.5.2.7 Visualization Requirements (SysML 2 Compliance)

The tool SHALL render requirement diagrams consistent with SysML 2 requirement diagram conventions.  The textual form of the displayed requirements is defined by Section 3.7 and
displayed in the Model Text Panel (6.5.2.21); where diagram convention and
textual notation differ, the textual notation is authoritative.


The diagram SHALL include as user toggleable display properties:

•	Requirement nodes displayed as structured blocks containing:
•	HID
•	Nam
•	Requirement Statement (RStatement)
•	Parent-child relationships rendered as directed links
•	Association relationships to:
•	(:Purpose)
•	(:Connection)
•	(:Component)
•	(:Interface)
•	(:SystemFunction)
•	(:Constraint)
•	(:Countermeasure)

Relationship representation SHALL use:

•	Directed edges for parentage
•	Labeled edges for association types
•	No icons; shape and color only

\---



#### 6.5.2.8 Visual Encoding Requirements



The Requirement Management Tool SHALL follow the same visual encoding rules as the Navigator Tool for interfaces and controls otherwise SysML 2 is authoritative in the diagram itself.

•	Node types SHALL be distinguished by shape and color only

•	Requirement nodes SHALL have a unique shape and color

•	Parent-child relationships SHALL be visually distinct from association relationships

•	Node states SHALL include:

•	Selected

•	Hover

•	Editable

•	Invalid (when applicable)

\---



#### 6.5.2.9 Parentage and Lineage Controls



The tool SHALL provide user controls to:



Parent Traversal

•	Display parent requirements up to a user-selected tier depth

•	Allow user input (e.g., Tier N range limit)

•	Dynamically update the diagram



Child Traversal

•	Display child requirements down to a user-selected tier depth

•	Support expansion and collapse



Combined View

•	Allow simultaneous display of parent and child relationships

\---



#### 6.5.2.10 Interaction Requirements



The diagram SHALL support:

•	Zoom (mouse wheel and controls)

•	Pan (drag)

•	Node selection

•	Hover highlighting

•	Animated centering

•	Expand/collapse of requirement branches



Selecting a node SHALL:

•	Highlight it

•	Display its properties in a Requirement Detail Panel

\---



#### 6.5.2.11 Requirement Editing Model



The Requirement Management Tool SHALL support editing of:

•	RStatement

•	VMethod

•	VStatement

•	Name

•	ShortDescription



Editing SHALL:

•	Use a right-side Data Drawer consistent with GUI standards

•	Follow the same staged editing model

•	Require Commit confirmation



All edits SHALL:

•	Be validated via Backend API

•	Be persisted only after successful Commit

\---



#### 6.5.2.12 Requirement Creation



The tool SHALL allow creation of new (:Requirement) nodes.



Creation SHALL require:

•	Selection of a valid parent requirement and associated node (node with [:HAS_REQUIREMENT] relationship)

•	Assignment of required properties



New nodes SHALL:

•	Receive valid HID and uuid values

•	Be inserted into the correct tier



\---



#### 6.5.2.13 Requirement Deletion



Deletion SHALL:

•	Follow the Alert / Confirm pattern

•	Identify and display dependent relationships

•	Warn of orphaned nodes



Deletion SHALL NOT:

•	Cascade outside the current SoI without explicit confirmation

\---



#### 6.5.2.14 Association Management



The tool SHALL allow association of requirements to:

•	(:Project)

•	(:System)

•	(:Component)

•	(:Interface)

•	(:SystemFunction)

•	(:Countermeasure)



The tool SHALL:

•	Validate all associations via Backend API

•	Prevent invalid associations

•	Visually distinguish valid vs invalid targets

\---



#### 6.5.2.15 Data Synchronization



Upon Commit:

•	The Backend SHALL persist all changes transactionally

•	The Main Panel SHALL refresh automatically

•	The Data Drawer SHALL update to reflect committed state





#### 6.5.2.16 Export Requirements



The tool SHALL support export of requirement diagrams.



Supported formats SHALL include:

•	PNG

•	SVG



Exports SHALL:

•	Preserve SysML 2 layout

•	Preserve node shapes and colors

•	Preserve labels and relationships



The user SHALL be able to export:

•	Current viewport

•	Full diagram

\---



#### 6.5.2.17 Performance Requirements



The tool SHALL:

•	Efficiently load requirement hierarchies

•	Support progressive loading for large requirement sets

•	Maintain UI responsiveness during expansion

\---



#### 6.5.2.18 Backend Integration Requirements



The Backend SHALL support:

•	Retrieval of requirement hierarchies

•	Retrieval of parent/child relationships

•	Retrieval of associated system elements

•	Validation of requirement associations

•	Transactional creation, update, and deletion



All operations SHALL be ACID-compliant.



\---

#### 6.5.2.19 Layout Requirements



The tool SHALL support:

•	Hierarchical layout (default for tiers)

•	Stable layout during interaction

•	Optional re-layout on demand



The layout SHALL:

•	Visually group requirements by tier
•	Minimize edge crossings where feasible

\---

#### 6.5.2.20 Reporting Integration

The Requirement Management Tool SHALL support:

•	Generation of diagrams suitable for reports
•	Consistent visual formatting across exports
•	Reproducible diagram states


#### 6.5.2.21 Model Text Panel

ModelTextLanguages: ["SYSML"]. Scope: the requirement hierarchy currently
displayed. The panel SHALL render requirement usages with subjects, doc
statements, #parents dependencies, and verify relationships per Section
3.7.6. Edit mode supports creation and modification of (:Requirement) nodes
and [:PARENTS] / [:HAS_REQUIREMENT] / [:VERIFIED_BY] relationships only.

\---



### 6.5.3 Reports Tool

#### 6.5.3.1 Tool Purpose
The Reports Tool allows Users to generate text based output in multiple format to support engineering activities.  Other Add-on Tools will produce specialized reports and other Output.  The Reports Tool is intended for more general reports such as a System Description and a System Specification.  In the future, this tool will be extended to support User defined report formats.




#### 6.5.3.2 Tool Wireframe





#### 6.5.3.3 Invocation





#### 6.5.3.4 Supported Node Context





#### 6.5.3.5 Modes of Operation





The Reports Dropdown Menu SHALL list the following reports to create

System Description

System Specification

Requirement‑Traceability Gap Analysis

Controls List



#### 6.5.3.6 System Description Report

System Description Report is a text based hierarchical description of the SoI, its primary nodes and relationships followed by its secondary nodes and relationships.

Report SHALL be in text, markdown, MS Word or PDF format.

* 

#### 6.5.3.7 System Specification Report

System Specification Report is a text based list of requirements for the SoI organized by the node they are related to within the SoI. It begins with a description of the SoI and its properties. One section per primary element type with [HAS_REQUIREMENT] relationship.  Sub-section for each entity of the type followed by an ordered list of requirements showing uuid and RequirementStatement properties for each.

Report SHALL be in text, markdown, MS Word or PDF format.



#### 6.5.3.8 Requirement‑Traceability Gap Analysis

Requirement‑Traceability Gap Analysis is a text based report identifying problematic requirements in the SoI.  This report is less informational and focused to remediating action. It is organized in the same way as the System Specification Report excepting when referring to Requirement properties it shows the UUID followed by the analytical properties: Baseline, Orphan and Barren.   Orphan and Barren properties are not user editable, but SHALL be by the generation of this report.



Baseline is not set by running this report but the (:Requirement) Baseline property is reported (note:  projects deal with baselines in a number of ways and the tool must be flexible with this property to support most use cases).



For a (:Requirement) property "Orphan" SHALL be true if any of these is true:

1. It has no parent (:Requirement)



In other words, a Requirement cannot be created without a parent, so an Orphan is likely the result of a node deletion and the Requirement is flagged foe reparenting or removal.



For a (:Requirement) property "Barren" SHALL be true if any of these is true:

1. It has no child (:Requirement)
2. it has no [HAS_REQUIREMENT] relationship other than with (:Purpose).



In other words, every requirement should be allocated to an Interface, Function or Element though there are valid exceptions.



For this analysis, valid incoming [:HAS_REQUIREMENT] sources are:

(:Connection), (:Interface), (:SystemFunction), (:Component), (:Purpose), (:Constraint), and (:Countermeasure). Allocated or Derived Requirements must be assigned to nodes other than Purpose.


#### 6.5.3.9 Model Text Panel and Report Embedding

ModelTextLanguages: ["SYSML", "KERML"], read-only. The System Description
and System Specification reports SHALL offer an optional appendix embedding
the G2M SysML 2.0 and KerML 1.0 text for the report scope, rendered in
monospace with the profile version noted.



\---



### 6.5.4 Reference Tool



#### 6.5.3.1 Tool Purpose

The Reference Tool allows the User to brows the Reference Data set and clone certain select nodes into the current SoI.  As a browser, the Reference Tool allows the User to select data from the set, then select relationships to display on the canvas.  The Reference Tool can traverse the entire set of MITRE ATT&CK, ATLAS and EMB3D data sets which have been normalized to be interoperable.  The scope of this data set is greater than used in SSTPA Tools, so a User can examine Cyber-Campaigns by threat actors and select attack nodes to clone based on this research.  The Reference Tool also allows the User to brows NIST 800-53,  Controls, the tables of relationships in CNSSI 1253, unclassified RMF Overlays, MITRE Cyber Survivability Attributes, and the tables and relationships among this data contained in the MITRE Cyber-Resiliency Framework and Cyber Survivability Attributes (MITRE Technical Report MTR210700R1).

The Reference Tool SHALL allow the User to:
1. Relate a valid Reference data to a valid node type in the active Data Drawer in Assignment Mode
2. Navigate imported reference frameworks and display its node properties and relationships without changing the current SoI in Research Mode
3. Search for a specific external reference item


Reference Tool SHALL initialize in Assignment Mode when the Data Drawer for a valid node type is open otherwise Reference Tool opens in Research Mode.
The User SHALL be able to switch the Research Tool into Research Mode at any time and switch back to the view in Assignment Mode.
The User will not be able to switch to Assignment Mode without a valid node type in the active Data Drawer.

#### 6.5.4.2 Tool Wireframe



#### 6.5.3.3 Invocation

The Reference Tool SHALL initialize into the Assignment Mode for the following supported node types.

•	(:SecurityControl)
•	(:Component)
•	(:System)
•	(:Hazard)
•	(:Attack)
•	(:Countermeasure)


On launch, the tool SHALL display:

•	Source node HID
•	Source node Name
•	Source node Type
•	Current SoI
•	Allowed framework filters for that source node type


Launching the tool SHALL NOT change the current SoI.

#### 6.5.4.4 Supported Node Context



#### 6.5.4.5 Modes of Operation

The Reference Catalog Tool SHALL support two modes:


a. Research Mode

•	Allows the User to navigate imported framework data
•	SHALL NOT modify the source SSTPA node
•	SHALL support hierarchical navigation where available
•	SHALL display the selected reference item in a read-only inspector

b. Assignment Mode

•	Allows the User to select a valid imported reference item and assign it to the source SSTPA node by switching to Assignment Mode
•	Allows User to follow internal references to a valid node for assignment
•	SHALL validate the proposed assignment through the Backend prior to commit
•	SHALL return the selected reference item to the calling Data Drawer context

#### 6.5.4.6 Layout

The Reference Catalog Tool pop-up window SHALL include:

•	ReferenceCatalogDialog
•	ReferenceFrameworkSelector
•	ReferenceTypeFilterBar
•	ReferenceSearchPanel
•	ReferenceHierarchyPane
•	ReferenceResultsGrid
•	ReferenceInspectorPanel
•	ReferenceActionBar

#### 6.5.4.7 Framework Selection and Filtering

The tool SHALL allow the User to filter by:

•	Framework
•	Framework version
•	Imported reference item type

The tool SHALL restrict displayed item types based on the source SSTPA node type.


Invalid framework item types for the current source SSTPA node SHALL be visually muted or hidden.


#### 6.5.4.8 Search and Locate

The tool SHALL provide a search interface.

Search SHALL support:

•	exact search by ExternalID
•	partial search by Name
•	partial search by ShortDescription
•	filtering by framework
•	filtering by item type
•	optional incremental search while typing

Search results SHALL:

•	be listed in a synchronized results panel
•	allow selection of a result
•	update the read-only inspector on selection

#### 6.5.4.9 Hierarchy Navigation

Where the imported framework supports hierarchy, the tool SHALL allow navigation by parent-child structure.

The tool SHALL support at minimum:

•	family/control/enhancement style navigation for NIST SP 800-53
•	tactic/technique style navigation for ATT\&CK
•	category/property-threat-mitigation style navigation for EMB3D

The tool MAY additionally display related imported reference items in a secondary related-items panel.



#### 6.5.4.10 Read-Only Reference Inspector

The selected imported reference item SHALL be displayed in a read-only inspector.

At minimum, the inspector SHALL display:

•	Framework name
•	Framework version
•	ExternalID
•	Reference item type
•	Name
•	ShortDescription
•	LongDescription
•	SourceURI

The inspector MAY additionally display:

•	parent item
•	child items
•	related items
•	framework-specific fields

The User SHALL NOT edit imported reference item content.



#### 6.5.4.11 Selection Actions


Actions SHALL be mode-dependent.

Browse / Inspect Mode

•	Expand Selected
•	Collapse Selected
•	Center on Selected
•	Close

Assign Reference Mode

•	Assign Selected Reference
•	Cancel
•	Close



Only valid actions SHALL be enabled.



#### 6.5.4.12 Data Drawer Integration

On successful assignment, the Reference Catalog Tool SHALL return the selected imported reference item to the calling Data Drawer.

The Data Drawer SHALL display assigned external references in a relationship group using:

•	ExternalID
•	Name
•	Framework
•	Reference item type

The Data Drawer SHALL allow:

•	launching the Reference Catalog Tool to add a reference
•	removing an existing [:REFERENCES] relationship
•	opening an assigned reference item in read-only inspection mode

#### 6.5.4.13 Out-of-SoI Editing Constraint



The Reference Catalog Tool SHALL NOT be treated as editing of the imported reference item or navigation to another SoI.

Assignment of a [:REFERENCES] relationship to an imported reference item SHALL be allowed even though the imported reference item is not part of the current SoI.

The tool SHALL NOT allow editing of any node outside the current SoI.


#### 6.5.4.14 Performance Requirements


The tool SHALL:

•	load framework metadata efficiently
•	render only required results initially
•	support progressive loading for large framework datasets
•	maintain UI responsiveness during search and navigation

Exact ExternalID lookup SHALL be faster than general text search.

\---



#### 6.5.4.15 Data Integration Requirements

The Reference Catalog Tool SHALL retrieve data from the Backend.

Required capabilities:

•	framework list retrieval
•	framework version retrieval
•	reference item lookup by ExternalID
•	reference item lookup by uuid
•	framework text search
•	framework hierarchy retrieval
•	related reference item retrieval
•	assignment validation
•	reference relationship creation and removal

The tool SHALL edit SSTPA nodes only by creating or removing [:REFERENCES] relationships through the Backend.



#### 6.5.4.15 Test and Verification Requirements


The Reference Catalog Tool SHALL be verified through test and analysis.


The system SHALL verify that:

•	imported framework items are retrievable by ExternalID
•	framework hierarchy is navigable where source data supports hierarchy
•	imported reference item properties are displayed read-only
•	invalid source-node-to-reference-item assignments are rejected
•	valid assignments create exactly one [:REFERENCES] relationship
•	removal of an assigned reference deletes only the [:REFERENCES] relationship
•	imported reference items are not modified by any GUI action
•	all assignment mutations are transactional and roll back on failure


#### 6.5.4.16 Model Text Panel

ModelTextLanguages: ["KERML"], read-only. The panel applies to Core Data
nodes shown in the tool (e.g., clone targets). When a Reference Graph item
is selected, the panel SHALL display the notice "Licensed reference content
— not translated (Section 3.7.2)" and the #externalref annotation that
would appear on referencing Core nodes.

---



### 6.5.5 The State Tool



#### 6.5.5.1 Purpose

The State Tool is an Add-on Tool used to visualize, create, edit, and analyze SysML 2.0 conformant aligned State Transition diagrams for the current System of Interest (SoI) using existing (:State) nodes and (:State)-[:TRANSITIONS_TO]->(:State) relationships.

* 

The tool described here SHALL be branded at top of window as "State Tool".





The State Tool SHALL allow the User to:

1. Display (:State) nodes and [:TRANSITIONS_TO] relationships in a SysML 2 state-transition visualization
2. Create new (:State) nodes within the active SoI
3. Create, edit, and remove [:TRANSITIONS_TO] relationships between valid (:State) nodes in the active SoI
4. View and edit transition relationship properties defined in Section 1.3.8.9
5. Associate and/or create related (:Requirement), (:Countermeasure), and (:Hazard) nodes in the active SoI
6. Display state transition criteria and related node relationships in a graph-like analytical view
7. Support analysis of how Hazards, Countermeasures, and Requirements relate to state behavior without changing the canonical Core Data Model representation of transitions as relationships rather than nodes
8. Display and edit the StateSequence property on (:State) nodes.
9. Display and manage [:VALID_IN] relationships between (:State) nodes and
(:Environment) nodes in the active SoI.



The State Tool SHALL be visually and interactively consistent with the Navigator Tool and Requirement Tool.



#### 6.5.5.2 Tool Wireframe





#### 6.5.5.3 Invocation

\-The State Tool SHALL:

• Be launched from the SSTPA Control Panel "State Tool" button

• Initialize to the State Diagram View if a Data Drawer is active for a (:State) node and center on that (:State)

• Initialize to the State Context View if a Data Drawer is active for a (:Countermeasure), (:Hazard), or (:Requirement) related to one or more (:State) nodes

• Initialize to the full active-SoI State Diagram View when no specific (:State) context is active



* 

#### 6.5.5.4 Supported Node Context

\-The tool SHALL support invocation when Data Drawer is open for:

• (:State)

• (:Countermeasure)

• (:Hazard)

• (:Requirement)

• (:System)

• (:Environment) — opens State Diagram View with Environment-assigned States
highlighted; the States with [:VALID_IN] to that Environment are visually
distinguished from unassigned States

• (:Loss) — opens Criteria / Relationship View showing the States assigned to
the Loss's Environment via [:VALID_IN], with StateSequence ordering displayed





The tool SHALL:

• Load all (:State) nodes in the current SoI needed for the selected view

• Load all [:TRANSITIONS_TO] relationships among displayed (:State) nodes

• Load related (:Hazard), (:Countermeasure), and (:Requirement) nodes needed for the selected context

• Allow the User to shift focus without changing the current SoI

• Provide a back action to return to the invoking context

• Allow user to move and arrange objects on the canvas



#### 6.5.5.5 Modes of Operation

The State Tool SHALL support three modes:



a. Diagram View

• Displays the current SoI state-transition diagram

• Allows selection of (:State) nodes and [:TRANSITIONS_TO] relationships

• Allows creation of new (:State) nodes

• Allows creation of new [:TRANSITIONS_TO] relationships

• Allows editing of displayed node and relationship properties through standard SSTPA edit patterns



b. Context View

• Displays a selected (:State), (:Countermeasure), (:Hazard), or (:Requirement) and its related state-transition context

• SHALL highlight related transitions and related nodes

• SHALL support filtering to the selected analytical context

• SHALL NOT change the current SoI



c. Criteria / Relationship View

• Displays a graph-like analytical view centered on selected (:State) nodes and [:TRANSITIONS_TO] relationships

• SHALL show transition criteria such as Trigger, GuardCondition, Rationale, Priority, and ResidualRiskNote

• SHALL show related (:Hazard), (:Countermeasure), and (:Requirement) nodes and their relationships to state behavior

• SHALL support expansion and collapse of related-node groupings

• SHALL display the StateSequence value for each (:State) node when present,
as an ordinal badge on the State block.

• SHALL display [:VALID_IN] relationships from each (:State) to (:Environment)
nodes as secondary edges in the view, visually distinct from [:TRANSITIONS_TO]
relationships.

• When invoked from a (:Loss) context, SHALL filter to display only the States
that have [:VALID_IN] to the Loss's (:Environment), ordered by StateSequence.

• When invoked from an (:Environment) context, SHALL filter to display only
the States assigned to that Environment via [:VALID_IN], ordered by
StateSequence.



#### 6.5.5.6 State Model Compliance

The State Tool SHALL use the Core Data Model representation of state behavior already defined by the SRS.



The State Tool SHALL:

• Treat (:State)-[:TRANSITIONS_TO]->(:State) as the canonical representation of a transition

• SHALL NOT introduce a Transition node into the Core Data Model

• Distinguish the semantic role of transitions using relationship properties, including TransitionKind

• Support transitions whose TransitionKind is FUNCTIONAL, COUNTERMEASURE_REQUIRED, or BOTH

• Support transition traceability to a governing (:Countermeasure) by RequiredByCountermeasureHID and/or RequiredByCountermeasureUUID when applicable



The tool SHALL preserve the preferred modeling rule that where the same source and destination (:State) pair is used both for ordinary behavior and to satisfy a (:Countermeasure), the preferred representation is a single [:TRANSITIONS_TO] relationship with TransitionKind = BOTH.







#### 6.5.5.7 Visualization Requirements

The State Tool SHALL render diagrams consistent with SysML 2.0 conformant state-transition diagram conventions to the maximum extent practical within the SSTPA Tool visual style.



The diagram SHALL include user-toggleable display of:

• (:State) nodes displayed as SysML 2 state blocks

• HID

• Name

• ShortDescription

• [:TRANSITIONS_TO] relationships rendered as directed transitions

• Transition labels derived from relationship properties, including Trigger and GuardCondition where present

• Visual distinction for TransitionKind values FUNCTIONAL, COUNTERMEASURE_REQUIRED, and BOTH

• Optional display of related (:Hazard), (:Countermeasure), and (:Requirement) nodes as analytical overlays or side-panel-linked objects



The diagram SHALL use:

• Directed edges for transitions

• Shape and color only for node-type distinction

• No icons within the diagram for node or relationship type identification



#### 6.5.5.8 Visual Encoding Requirements



The State Tool SHALL follow the same visual encoding rules established for the Navigator Tool unless SysML 2.0 conformant convention is authoritative within the diagram itself.



The tool SHALL visually distinguish:

• (:State)

• (:Hazard)

• (:Countermeasure)

• (:Requirement)



The tool SHALL visually distinguish transition semantics using non-icon methods such as:

• Line style

• Stroke thickness

• Color

• Label treatment

• Glow or highlight state



The following transition states SHALL be visually distinct:

• Selected transition

• Hover state

• Editable transition

• Invalid transition proposal

• TransitionKind = FUNCTIONAL

• TransitionKind = COUNTERMEASURE_REQUIRED

• TransitionKind = BOTH



#### 6.5.5.9 Interaction Requirements



The diagram SHALL support:

• Zoom (mouse wheel and controls)

• Pan (drag)

• Node selection

• Relationship selection

• Hover highlighting

• Animated centering

• Expand/collapse of related analytical overlays

• Keyboard navigation

• Escape to close



Selecting a (:State) node SHALL:

• Highlight the node

• Display its properties and related relationships in a State Detail Panel



Selecting a [:TRANSITIONS_TO] relationship SHALL:

• Highlight the relationship

• Display its relationship properties in a Transition Detail Panel

• Display related (:Countermeasure), (:Hazard), and (:Requirement) nodes where present



#### 6.5.5.10 State Creation



The State Tool SHALL allow creation of new (:State) nodes within the current SoI.



Creation SHALL:

• Use the standard SSTPA staged editing and Commit confirmation model

• Assign valid HID and uuid values

• Assign the new node to the active SoI

• Open the created (:State) in the standard Data Drawer or State Detail Panel for further editing

• StateSequence = Null (default; the User assigns sequence via the Context Tool
or inline in the State Detail Panel)



New (:State) nodes SHALL receive:

• Common properties per Section 1.3.7

• Type-specific defaults per Section 1.3.8.9

• Correct Owner, Creator, and LastTouch behavior per Section 1.3.7.1



#### 6.5.5.11 Transition Creation and Editing



The State Tool SHALL allow the User to create a [:TRANSITIONS_TO] relationship between two valid (:State) nodes in the active SoI.



Transition creation SHALL:

• Require selection of a source (:State)

• Require selection of a destination (:State)

• Stage relationship properties prior to Commit

• Validate duplicate-logical-relationship constraints before Commit

• Validate countermeasure traceability fields where TransitionKind requires them



The tool SHALL allow editing of the following transition relationship properties:

• TransitionKind

• Trigger

• GuardCondition

• Rationale

• RequiredByCountermeasureHID

• RequiredByCountermeasureUUID

• Priority

• ResidualRiskNote



If TransitionKind = COUNTERMEASURE_REQUIRED or BOTH, the tool SHALL require RequiredByCountermeasureHID and/or RequiredByCountermeasureUUID to identify the governing (:Countermeasure) before Commit is allowed.



#### 6.5.5.12 Related Node Association and Creation



The State Tool SHALL allow association and/or creation of the following related node types within the current SoI:

• (:Requirement)

• (:Countermeasure)

• (:Hazard)



The tool SHALL support:

• Associating an existing (:Hazard) to a (:State) via [:HAS_HAZARD]

• Associating an existing (:Countermeasure) to a (:State) via [:APPLIES_TO_STATE]

• Associating an existing (:Requirement) to a (:Countermeasure) via [:HAS_REQUIREMENT]

• Creating new related (:Hazard), (:Countermeasure), and (:Requirement) nodes using standard SSTPA staged editing behavior



The State Tool SHALL NOT create invalid direct relationships not defined in the Core Data Model.



For (:Requirement), the State Tool SHALL support its creation and association through the valid node that owns the requirement relationship, typically (:Countermeasure), (:Purpose), or another valid requirement-bearing node per the Core Data Model.



#### 6.5.5.13 Criteria / Relationship View Requirements



The Criteria / Relationship View SHALL provide a graph-like analytical display of:

• Selected (:State) nodes

• Their outgoing and incoming [:TRANSITIONS_TO] relationships

• Transition criteria and analysis properties

• Related (:Hazard) nodes

• Related (:Countermeasure) nodes

• Related (:Requirement) nodes through valid intermediate nodes



This view SHALL allow the User to:

• Filter by TransitionKind

• Filter by selected (:Countermeasure)

• Filter by selected (:Hazard)

• Filter by selected (:Requirement)

• Toggle display of transition criteria labels

• Toggle display of related-node overlays

• Center on a selected node or transition

• Export the current analytical view



##### 6.5.5.13.1 StateSequence and VALID_IN Editing

The State Tool SHALL allow the User to view and edit the StateSequence property
on (:State) nodes from the State Detail Panel.

The State Detail Panel SHALL display:

* StateSequence: editable integer field, displayed as "Lifecycle Sequence:"
with current value or "Not Set" if Null.
* A note that StateSequence is used for SAND sequencing in the Loss Tool.

  The User SHALL be able to set StateSequence to any non-negative integer. Setting
it to Null removes the sequence assignment. Changes are staged and Commit
persists the update.

  The State Tool SHALL display the current [:VALID_IN] assignments for a selected
(:State) node in the State Detail Panel:

* A list of (:Environment) nodes to which this State is currently assigned via
[:VALID_IN].
* An "Add Environment" button that opens an Environment selector showing all
(:Environment) nodes in the active SoI not yet in the list.
* A "Remove" action for each existing [:VALID_IN] entry.

  Editing [:VALID_IN] assignments from the State Tool SHALL follow the same staged
edit and Commit model as all other State Tool edits.

  The State Tool SHALL NOT be the primary interface for bulk StateSequence assignment
or bulk [:VALID_IN] management (those functions belong to the Context Tool). It
provides per-State editing as a convenience.



  #### 6.5.5.14 Validation Requirements


  The State Tool SHALL validate all proposed mutations through the Backend API prior to Commit.


  Validation SHALL confirm:

  • Both transition endpoints are valid (:State) nodes
  • Both endpoint (:State) nodes belong to the same SoI unless explicitly allowed by future analytical extension
  • Duplicate logical [:TRANSITIONS_TO] relationships do not already exist unless distinguished by valid relationship properties
  • TransitionKind values are valid
  • RequiredByCountermeasureHID and/or RequiredByCountermeasureUUID identify an existing (:Countermeasure) when TransitionKind = COUNTERMEASURE_REQUIRED or BOTH
  • Any referenced governing (:Countermeasure) belongs to the same SoI as both endpoint (:State) nodes unless explicitly justified as a cross-SoI analytical relationship
  • All other proposed relationships conform to the Core Data Model
  • StateSequence, when set, is a non-negative integer.
  • All proposed [:VALID_IN] relationships connect a (:State) and an (:Environment)
that both belong to the active SoI.
  • Removal of a [:VALID_IN] relationship does not leave a (:Loss) node in the SoI
with no remaining valid States in its tree (generate a WARNING if this condition
would occur, but do not block Commit).



  The API SHALL return:

  • Valid / invalid
  • Reason for invalidity



  #### 6.5.5.15 Data Drawer Integration



  On successful selection from the State Tool, the calling Data Drawer SHALL be able to display:

  • Related (:State) nodes
  • [:TRANSITIONS_TO] relationships and their properties
  • Related (:Hazard) nodes
  • Related (:Countermeasure) nodes
  • Related (:Requirement) nodes as reachable through valid requirement-bearing nodes
  • StateSequence property of the selected (:State)
• [:VALID_IN] Environment assignments for the selected (:State)



  The Data Drawer SHALL allow:

  • Launching the State Tool from a valid node context
  • Removing a valid relationship subject to orphan and deletion rules already defined by the SRS
  • Opening selected related nodes for edit within the SoI


  #### 6.5.5.16 Export Requirements

  The State Tool SHALL support export of state diagrams and analytical views.

  Supported formats SHALL include:

  • PNG
  • SVG

  Exports SHALL preserve:

  • Node shapes
  • Node colors
  • Labels based on current visibility settings
  • Relationship directionality
  • Relationship style distinctions
  • Visible transition criteria labels

  The User SHALL be able to export:

  • Current viewport
  • Full visible diagram

  #### 6.5.5.17 Performance Requirements



  The State Tool SHALL:

  • Efficiently load state-transition diagrams for the active SoI
  • Support progressive loading for large state-transition graphs
  • Maintain UI responsiveness during expansion, filtering, and selection
  • Use bounded traversal for recursive transition analysis
  • Avoid unbounded recursive expansion of state-transition relationships

  Exact HID and uuid lookup for (:State) nodes SHALL be faster than general text search.


  #### 6.5.5.18 Data Integration Requirements

  The State Tool SHALL retrieve data from the Backend.

  Required capabilities:

  • Retrieval of all (:State) nodes within the current SoI
  • Retrieval of [:TRANSITIONS_TO] relationships and their properties
  • Retrieval of related (:Hazard), (:Countermeasure), and (:Requirement) context
  • Validation of transition creation and edit operations
  • Transactional creation, update, and deletion of permitted nodes and relationships

  The State Tool SHALL execute all mutations through Backend API interactions as transactional graph mutations.

  All write operations SHALL be ACID compliant.

  #### 6.5.5.19 Layout Stability Requirements


  The State Tool SHALL maintain layout stability during:

  • Selection
  • Search
  • Filtering
  • Expansion
  • Mode switching


  The layout engine SHALL:

  • Preserve relative node positioning where feasible
  • Avoid unnecessary full-layout recomputation during interaction
  • Support a state-diagram-oriented layout mode
  • Support a force-directed analytical layout mode for Criteria / Relationship View

  Switching layouts SHALL NOT reset user context unless explicitly requested.



  #### 6.5.5.20 Reporting and Capture Use Case Support

  The State Tool SHALL support use in reporting workflows.

  The tool SHALL:

  • Allow users to visually frame portions of the state diagram
  • Preserve layout and styling in exports
  • Support repeated capture of consistent visual states
  • Support generation of figures suitable for insertion into System Description, System Specification, and future analytical reports

  #### 6.5.5.21 Test and Verification Requirements

  The State Tool SHALL be verified through test and analysis.

  The system SHALL verify that:

  • (:State) nodes in the active SoI are retrievable and displayable
  • valid [:TRANSITIONS_TO] relationships are retrievable and displayable
  • new (:State) nodes receive correct HID and uuid values
  • valid transitions can be created and edited
  • invalid transitions are rejected
  • TransitionKind semantics are correctly represented
  • required countermeasure traceability is enforced when TransitionKind = COUNTERMEASURE_REQUIRED or BOTH
  • the tool does not create Transition nodes outside the Core Data Model
  • all permitted mutations are transactional and roll back on failure
  • exported diagrams preserve visible relationship direction and labeling


#### 6.5.5.22 Model Text Panel

ModelTextLanguages: ["SYSML"]. Scope: the SoI state model. The panel SHALL
render state usages and transition usages (first/then form) with
TransitionKind, Trigger, GuardCondition, and Rationale attributes per
Section 3.7.6. Edit mode supports (:State) and [:TRANSITIONS_TO] mutations
and [:VALID_IN] display (read-only here; edited in the Context Tool).
  \---



  ### 6.5.6 The Flow Tool

  #### 6.5.6.1 Purpose

The Flow Tool is an Add-on Tool used to visualize, create, edit, and analyze Functional Flow and STPA Control Flow diagrams for the current System of Interest (SoI) using (:SystemFunction), (:Interface), (:Connection), and ControlStructure-related nodes.

The Flow tool is intended to allow the User to model the functional Flow of the current SoI.  The SoI may have several independent functional flows.   The User will use the Flow tool to use or create functions and interfaces and create relationships between them and graphicly depict these as a SySML 2 Activity Diagram.  The User may also cast a functional flow as an STPA Control Flow and in this way capture Control Actions and Feedback messages.  The Flow Tool will depict these in an STPA Control Flow Diagram casting Functions and Interfaces or sub-flows of functions and interfaces as STPA actors.  


  The tool described here SHALL be branded at top of window as "Flow Tool".

  The Flow Tool SHALL allow the User to:



  • Visualize and analyze Functional Flow between (:SystemFunction) and (:SystemFunction) nodes and (:SystemFunction) and (:Interface) nodes
  • Visualize and analyze STPA Control Flow using (:ControlStructure) roles
  • Store and retrieve visualizations from a structured JSON file as property of  (:ControlStructure) or (:FunctionalFlow)
  • Create, edit, and remove flow relationships between (:SystemFunction) and (:Interface) nodes
  • Create and relate (:SystemFunction), (:Interface), (:Requirement), and (:Countermeasure) nodes
  • Associate (:Interface) nodes to (:Connection) nodes (including cross-SoI ownership cases)
  • Define the nature of flow relationships including physical and logical (OSI-based) characteristics
  • Create and manage Feedback relationships in flows
  • Display and filter flows associated with (:Countermeasure) nodes
  • Assign (:SystemFunction) and (:Interface) nodes to STPA roles in (:ControlStructure)
  • Create and assign (:ControlAction) and (:Feedback) nodes
  • Commit validated changes to the Backend

  The Flow Tool SHALL be visually and interactively consistent with the Navigator Tool and Requirements Tool.

  \---


  #### 6.5.6.2 Tool Wireframe



  #### 6.5.6.3 Invocation

  The Flow Tool SHALL:



  • Be launched from the SSTPA Control Panel

  • Initialize to Functional Flow Mode if a Data Drawer is open for (:SystemFunction) or (:Interface) and by default

  • If a Data Drawer is open for (:SystemFunction) or (:Interface), center and focus on that node

  • Initialize to STPA Control Flow mode if a Data Drawer is open for (:ControlStructure), (:ControlAlgorithm), (:ProcessModel), (:ControlledProcess), (:ControlAction), or (:Feedback).

  • If neither Drawer is open, the default SHALL be the Functional Flow Mode.

  • If there is more than one (:FunctionalFlow) node, the Tool SHALL present the name properties for all and allow the User to select which to operate on.

  • If there is more than one (:ControlStructure) node, the Tool SHALL present the name properties for all and allow the User to select which to operate on.

  • Load all relevant flow relationships within the active SoI

  • NOT change the current SoI





  #### 6.5.6.4 Supported Node Context



  #### 6.5.6.5 Modes of Operation



  The Flow Tool SHALL support two modes:



  a. "Functional Flow" Mode

  b. "STPA Control Flow" Mode



  For both modes the visualization SHALL come from a  structured JSON file as property of either  (:ControlStructure) or (:FunctionalFlow) which will hold the elements and their position on the canvas.

  The Tool SHALL operate on the Structured JSON file used for visualization to capture User changes.





  The User SHALL be able to switch between modes without changing the current SoI.



  \---



  #### 6.5.6.6 Scope Constraints



  The Flow Tool SHALL:



  • Restrict node creation, relationship creation, and editing to the current SoI

  • Allow association of (:Interface) nodes in the SoI to (:Connection) nodes owned by another SoI

  • NOT allow editing of nodes outside the current SoI

  • Enforce all Core Data Model constraints



  \---

  #### 6.5.6.7 Functional Flow Mode



  In Functional Flow Mode, the tool SHALL:



  • Display (:SystemFunction) and (:Interface) nodes

  • Display relationships:

* • (:SystemFunction)-[:FLOWS_TO_FUNCTION]->(:SystemFunction)
* • (:SystemFunction)-[:FLOWS_TO_INTERFACE]->(:Interface)
* • (:Interface)-[:CONNECTS]->(:SystemFunction)
* • (:Interface)-[:PARTICIPATES_IN]->(:Connection)



  • Allow creation and editing of these relationships

  • Allow creation of new (:SystemFunction) and (:Interface) nodes

  • Allow assignment of (:Requirement) and (:Countermeasure) nodes

  • Allow creation and display of Feedback relationships

  • Allow user to move and arrange objects on the canvas while maintaining relationships.



  \---



  #### 6.5.6.8 Countermeasure Overlay



  The Flow Tool SHALL allow:



  • Display of nodes and relationships associated with (:Countermeasure)

  • Filtering of flows impacted by Countermeasures

  • Visualization of how Countermeasures alter flow behavior



  \---



  #### 6.5.6.9 Feedback Relationships



  The Flow Tool SHALL support Feedback relationships:



  • (:ControlledProcess)-[:PRODUCES]->(:Feedback)

  • (:Feedback)-[:INFORMS]->(:ProcessModel)



  The tool SHALL allow:



  • Creation of (:Feedback) nodes

  • Assignment and editing of properties and their values

  • Visualization within both modes



  \---



  #### 6.5.6.10 STPA Control Flow Mode



  In STPA Control Flow Mode, the tool SHALL:



  • Display (:ControlStructure) and its child nodes:

* • (:ControlAlgorithm)
* • (:ControlledProcess)
* • (:ProcessModel)
* • (:ControlAction)
* • (:Feedback)



  • Allow casting of (:SystemFunction) and (:Interface) nodes into STPA roles

  • Display Control Flow relationships:

* • (:ControlAlgorithm)-[:GENERATES]->(:ControlAction)
* • (:ControlAction)-[:COMMANDS]->(:ControlledProcess)
* • (:ControlledProcess)-[:PRODUCES]->(:Feedback)
* • (:Feedback)-[:INFORMS]->(:ProcessModel)
* • (:ProcessModel)-[:TUNES]->(:ControlAlgorithm)



  \---



  #### 6.5.6.13 STPA Role Assignment Rules

  The Flow Tool SHALL enforce:

  • (:SystemFunction) MAY be assigned to:

* • (:ControlAlgorithm)
* • (:ControlledProcess)
* • (:ProcessModel)

  • (:Interface) MAY be assigned to:

* • (:ControlAlgorithm)
* • (:ControlledProcess)

  • (:Interface) SHALL NOT be assigned to (:ProcessModel)

  • Validation SHALL reject invalid assignments


 ---


  #### 6.5.6.14 ControlAction and Feedback Nodes


  The Flow Tool SHALL allow:


  • Creation of (:ControlAction) nodes
  • Creation of (:Feedback) nodes
  • Assignment and editing of properties and their values to include relating (:Hazard) nodes to (:ControlAction) and relating (:Countermeasure) nodes to (:Feedback).
  • Assignment into STPA Control Flow

  ---



  #### 6.5.6.15 Visualization Requirements



  The Flow Tool SHALL:

  • Render diagrams in a canvas consistent with SysML 2.0 conformant functional and control flow conventions
  • Use directed edges for flow
  • Distinguish:
* • Function vs Interface
* • Physical vs Logical flow
* • Control (STPA) vs linear vs Feedback flow

  • Use shape and color only (no icons)

  • Use a right side panel in the pop-up window for all editing arranged in a manner similar to its GUI data drawer representation.

  • Display relationship properties

  \---

  #### 6.5.6.16 Interaction Requirements

  The tool SHALL support:

  • Zoom, pan, selection, hover
  • Node and relationship selection
  • Editing via Data Drawer
  • Animated centering
  • Expand/collapse
  • User interaction to position objects on the canvas

  Selecting a node SHALL:

  • Highlight the node
  • Display its properties

  Selecting a relationship SHALL:

  • Display its properties



  \---



  #### 6.5.6.17 Node and Relationship Creation



  The tool SHALL allow creation of:



  • (:SystemFunction)

  • (:Interface)

  • (:Requirement)

  • (:Countermeasure)



  The tool SHALL:



  • Assign valid HID and uuid

  • Enforce SoI constraints

  • Use staged edit + Commit model



  \---



  #### 6.5.6.18 Validation Requirements



  The Backend SHALL validate:



  • Same-SoI constraints for flow relationships

  • Valid node types for relationships

  • STPA role assignment rules

  • Duplicate relationship prevention

  • Valid Connection participation rules



  \---



  #### 6.5.6.19 GUI and Data Drawer Integration



  The GUI SHALL refresh after the Flow Tool performs a commit:



  \---



  #### 6.5.6.20 Export Requirements



  The tool SHALL support export:



  • PNG

  • SVG



  Exports SHALL preserve:



  • Node shapes and colors

  • Relationship styles

  • Labels



  \---



  #### 6.5.6.21 Performance Requirements



  The Flow Tool SHALL:



  • Use bounded traversal

  • Support progressive loading

  • Maintain responsiveness

  • Prevent unbounded recursive queries



  \---



  #### 6.5.6.22 Backend Integration



  The Flow Tool SHALL:



  • Use Backend API for all operations

  • Execute mutations as ACID transactions

  • Fully rollback on failure



  \---



  #### 6.5.6.23 Test and Verification



  The system SHALL verify:



  • Functional flow relationships are correctly created and validated

  • STPA role assignments enforce constraints

  • Invalid assignments are rejected

  • ControlAction and Feedback nodes behave correctly

  • Flow properties persist correctly

  • All operations are transactional


#### 6.5.6.24 Model Text Panel

ModelTextLanguages: ["SYSML", "KERML"]. Functional Flow mode SHALL display
SysML 2.0: the view usage with expose members and succession flows per
Section 3.7.6. STPA Control Flow mode SHALL display KerML 1.0: the Control
Structure package with STPA role features and loop connectors. Edit mode
follows the active mode's authorized relationship set.

  \---



  ### 6.5.7  The Asset Manager Tool

  #### 6.5.7.1 Purpose
The Asset Manager Tool is an Add-on Tool used to create, inspect, edit, organize, and analyze Assets within the current System of Interest (SoI).  Similar to the Requirements Tool, the Asset Manager Tool can graphicly depict the hierarchical relationships of Assets based on their Parents property and their property as an Organic, Horizontal or Derived Asset.  The Tool can also graphicly depict the elements, functions and interfaces related to the Asset.  Asset Manager allows the User to relate Assets to Regimes and manage Regime properties.  While not able to process Loss and GsnGoal nodes, it can identify and depict their relationship to a specific Asset.


  The Asset Manager Tool SHALL provide a structured, table-oriented, and methodologically guided interface for managing:

  • (:Asset) nodes
  • (:Regime) nodes
  • (:Loss) nodes
  • Root (:GsnGoal) nodes
  • Asset relationships to Elements, Functions, Interfaces, States, and Environments

  The tool SHALL guide the User in defining Assets and their associated certification structures while preserving User flexibility and avoiding rigid prescriptive workflows.

  The Asset Manager Tool SHALL support both:

1. efficient expert workflows; and
2. progressive disclosure for less experienced Users



   The tool SHALL be branded at the top of the pop-up window as “Asset Manager Tool”.

   \---



   #### 6.5.7.2 Wireframe



   #### 6.5.7.3 Invocation



   The Asset Manager Tool SHALL be launched from the SSTPA Control Panel.



   If a Data Drawer is open for:



   • (:Asset) → the tool SHALL open focused on that Asset

   • (:System) → the tool SHALL display all Assets in the SoI

   • (:Component), (:SystemFunction), (:Interface), (:State), (:Environment) → the tool SHALL filter Assets associated with that node



   If no context exists, the tool SHALL display all Assets in the current SoI.



   Opening the Asset Manager Tool SHALL NOT change the current SoI.



   \---

   #### 6.5.7.4 Supported Node Context

   #### 6.5.7.5 Modes of Operation

   The tool SHALL support:

   a. Table View

   • asset overview

   • sorting/filtering



   b. Detail View

   • full Asset editing

   • relationship editing



   c. Regime View

   • Master Regime management

   • cloning and editing



   d. Validation View

   • missing relationships

   • incomplete definitions

   • inconsistent Criticality/Assurance

   • "Loss nodes without Environment" — lists (:Loss) nodes with no
[:HAS_ENVIRONMENT] relationship. Provides a "Launch Context Tool" button.

   • "Invalidated Attack Trees" — lists (:Loss) nodes with AttackTreeStatus =
INVALIDATED. Displays the validation finding summary from AttackTreeJSON.
Provides a "Open in Loss Tool" button for each.



   \---



   #### 6.5.7.6 Core Concepts



   ##### Asset Types



   Assets SHALL be classified into two types:



   • PRIMARY

   • DERIVED



   PRIMARY Assets:



   • represent intrinsically valuable entities

   • SHALL define their own Criticality and Assurance needs



   DERIVED Assets:



   • derive their value from enabling compromise of a PRIMARY Asset

   • SHALL reference one or more PRIMARY Assets

   • SHALL inherit Criticality from the referenced PRIMARY Asset(s)

   • MAY define additional Assurance requirements



   Example:

   A cryptographic key used to protect a data Asset is a DERIVED Asset.



   ##### Asset Relationships



   Assets MAY be related to:

   • (:Component)

   • (:SystemFunction)

   • (:Interface)

   • (:State)

   • (:Environment)



   These relationships SHALL define where the Asset exists, is processed, or is exposed.



   \---



   #### 6.5.7.7 Asset Table View



   The primary interface SHALL be a table displaying all Assets in the current SoI.



   Each row SHALL represent one (:Asset).



   Columns SHALL include:



   • HID

   • Name

   • Asset Type (PRIMARY / DERIVED)

   • Criticality (multi-value)

   • Assurance (multi-value)

   • Associated Regimes

   • Associated Elements

   • Associated Functions

   • Associated Interfaces

   • Associated States

   • Associated Environments

   • Derived From (if DERIVED)

   • Number of Loss nodes

   • Goal Structure status

   • Validation status



   The table SHALL support:



   • sorting

   • filtering

   • column visibility control

   • multi-select

   • inline editing (where permitted)

   • search (HID, Name, description)



   \---



   #### 6.5.7.7 Progressive Disclosure UX



   The Asset Manager Tool SHALL use progressive disclosure to manage complexity.



   The UI SHALL support expandable panels per Asset:



   Level 1 (collapsed):



   • Summary row (table view)



   Level 2 (expanded row):



   • Core properties

   • Criticality and Assurance selection

   • Regime selection

   • Asset relationships (high-level)



   Level 3 (detail panel or modal):



   • Full property editing

   • Relationship editing

   • Loss configuration

   • Goal access



   The tool SHALL NOT require Users to complete all fields before creating an Asset.



   The tool SHALL guide but SHALL NOT enforce strict sequencing.



   \---



   #### 6.5.7.8 Asset Creation



   The tool SHALL allow creation of new (:Asset) nodes.



   On creation:



   • HID and uuid SHALL be generated

   • Asset Type SHALL be selected (PRIMARY or DERIVED)

   • default properties SHALL be initialized

   • Owner, Creator, Created, and LastTouch SHALL be assigned



   The tool SHALL prompt the User to:



1. define Criticality values
2. define Assurance values
3. assign or create Regimes
4. associate Environments



   \---



   #### 6.5.7.9 Automatic Node Generation



   For each Asset, the Asset Manager Tool SHALL automatically create Loss and Goal
nodes covering the Criticality and Assurance space of that Asset, without the
Environment dimension. The Environment dimension is managed separately by the
Context Tool (Section 6.5.8).

   **Generation trigger:**

   Auto-generation SHALL be triggered when the User commits a new (:Asset) node,
or when the User edits an (:Asset)'s Criticality or Assurance properties and
commits the change.

   **Generation rule:**

   For each distinct (Criticality C, Assurance S) pair where Criticality C is True
and Assurance S is True on the (:Asset):

   The Asset Manager Tool SHALL verify whether a (:Loss) node for this tuple
already exists under this Asset (i.e. whether (:Asset)-[:HAS_LOSS]->(:Loss)
exists where Loss.C = True and Loss.S = True and Loss has no [:HAS_ENVIRONMENT]).

   If no such (:Loss) exists, the tool SHALL create:

* One (:Loss) node with:

  * The single true Criticality C set to True; all others False.
  * The single true Assurance S set to True; all others False.
  * Name = "Compromise {Asset.Name} {C} {S}" (Environment TBD).
  * ShortDescription = "Pending Environment assignment. Created from Asset {Asset.HID}."
  * AttackTreeStatus = NOT_BUILT.
  * TreeIsValid = False. TreeHasRVs = False. PathCount = Null.
  * No [:HAS_ENVIRONMENT] relationship (pending Context Tool assignment).
  * Valid HID and uuid. Owner and Creator = current User.
* One Root (:GsnGoal) node with:

  * GoalStatement = "The {C} of {S} of {Asset.Name} is acceptable."
  * Valid HID and uuid. Owner and Creator = current User.

  The tool SHALL create relationships:

* (:Asset)-[:HAS_LOSS]->(:Loss)
* (:Asset)-[:HAS_GOAL]->(:GsnGoal)

  All operations SHALL be committed as a single ACID transaction with the parent
Asset creation or property update.

  **When Criticality or Assurance properties are removed:**

  If the User sets a Criticality or Assurance property to False on an existing
Asset, and (:Loss) nodes exist for that (Criticality, Assurance) pair, the Asset
Manager Tool SHALL display a WARNING identifying the Loss nodes that are now
analytically unsupported by the Asset's current properties. The tool SHALL NOT
automatically delete those Loss nodes. Deletion is an explicit User action.

  **Environment assignment reminder:**

  After generating new Loss nodes, the Asset Manager Tool SHALL display a
notification: "Loss nodes created without Environment assignment. Use the
Context Tool to assign Environments and complete Loss definitions."



  \---



  #### 6.5.7.10 Regime Management



  ##### Regime Concept



  A (:Regime) represents a certification authority or governing standard.



  Each Asset SHALL have one or more Regimes per Criticality.



  Regimes MAY differ between:



  • PRIMARY Assets

  • DERIVED Assets

  • different Criticalities



  ##### Master Regime Node



  The system SHALL support a reusable master Regime node:



  (:MasterRegime)



  The Master Regime SHALL serve as a template.



  Properties SHALL include:



  • Name

  • Authority

  • Standard

  • Description

  • Certification Scope

  • Metadata fields



  ##### Regime Cloning



  The Asset Manager Tool SHALL allow Users to:



  • select a Master Regime

  • clone it into an Asset-specific (:Regime) node



  Cloning SHALL:



  • copy all properties

  • generate new HID and uuid

  • associate the new Regime with the Asset



  Relationship:



  (:Asset)-[:HAS_REGIME]->(:Regime)



  The tool SHALL support:



  • editing cloned Regimes

  • creating new Master Regimes

  • reusing Master Regimes across the SoI



  ##### UX Requirements



  The tool SHALL provide:



  • Regime selection dropdown

  • searchable Master Regime list

  • “Clone Regime” action

  • “Create New Regime” action

  • inline Regime editing



  \---



  #### 6.5.7.11 Asset Relationship Allocation



  The tool SHALL allow allocation of Assets to:



  • Elements

  • Functions

  • Interfaces

  • States

  • Environments



  The tool SHALL provide:



  • multi-select pickers

  • graph-assisted selection (optional)

  • filtered lists based on SoI



  The tool SHALL validate:



  • same SoI membership

  • valid relationship types



  The tool SHALL allow batch allocation.



  \---



  #### 6.5.7.12 Derived Asset Handling



  For DERIVED Assets:



  The tool SHALL require association to at least one PRIMARY Asset.



  Relationship:



  (:Asset)-[:DERIVED_FROM]->(:Asset)



  Constraints:



  • target SHALL be PRIMARY

  • DERIVED Asset SHALL inherit Criticality

  • tool SHALL visually indicate inherited Criticality



  The tool SHALL allow additional Assurance values.



  \---



  #### 6.5.7.13 Loss Editing Integration



  The tool SHALL allow editing of Loss nodes.



  The tool SHALL display:



  • Loss HID

  • Criticality

  • Assurance

  • Environment

  • associated Goal

  • AttackTreeStatus badge
• TreeIsValid indicator (green check / red X)
• PathCount (if tree has been built)
• Environment assignment status ("Assigned: {Environment Name}" or "Unassigned")
• validationFindings count badge (if AttackTreeJSON is present and has findings)



  The tool SHALL allow:



  • opening Loss in Loss Tool

  • inline editing of allowed properties

  • regeneration of missing Loss nodes

  • Launching the Context Tool to assign an Environment to an unassigned Loss node
• Viewing validation findings from AttackTreeJSON in a read-only findings panel



  \---



  #### 6.5.7.14 Goal Integration



  The tool SHALL allow access to Goal Structures.



  The tool SHALL display:



  • Root Goal status

  • completeness indicator

  • evidence indicator



  The tool SHALL allow:



  • opening Goal Keeper Tool

  • navigating to Root Goal



  \---





  #### 6.5.7.14 Validation Requirements



  The tool SHALL validate:



  • DERIVED Assets reference PRIMARY Assets

  • Loss nodes exist for each true (Criticality, Assurance) combination on the Asset
(Environment assignment is managed by the Context Tool and is not validated here)

  • Loss nodes with AttackTreeStatus = INVALIDATED are flagged with a WARNING,
identifying which Core Data changes triggered the invalidation

  • Loss nodes with no [:HAS_ENVIRONMENT] assignment are flagged with an INFO
notification, not a blocking error (Environment assignment is a Context Tool
responsibility)

  • Root Goal exists for each Loss

  • Regime exists for each Criticality

  • relationships are valid and within SoI



  The tool SHALL provide:



  • warnings (non-blocking)

  • errors (blocking)



  \---



  #### 6.5.7.15 Interaction Requirements



  The tool SHALL support:



  • inline editing

  • batch operations

  • undo before commit

  • search

  • filtering

  • hover highlighting

  • keyboard navigation

  • commit confirmation



  \---



  #### 6.5.7.16 Performance Requirements



  The tool SHALL:



  • support large Asset sets

  • use pagination

  • support lazy loading

  • maintain UI responsiveness



  \---



  #### 6.5.7.17 Backend Integration



  The tool SHALL:



  • retrieve Assets for SoI

  • retrieve Regimes and Master Regimes

  • create and update Assets

  • create Loss and Goal nodes automatically

  • validate all changes before commit

  • persist all changes transactionally



  \---



  #### 6.5.7.18 UX Design Principles



  The Asset Manager Tool SHALL:



  • guide without enforcing rigid workflows

  • minimize cognitive load

  • expose complexity progressively

  • support expert speed workflows

  • maintain consistency with other Add-on Tools



  The tool SHALL prioritize:



  • clarity of relationships

  • ease of navigation

  • minimal data duplication

  • fast editing cycles



  \---



  #### 6.5.7.19 Test and Verification Requirements



  The system SHALL verify:



  • Asset creation works for PRIMARY and DERIVED

  • Loss and Goal nodes are automatically created

  • Regimes can be cloned from Master Regime

  • DERIVED Assets inherit Criticality

  • relationships are valid

  • UI interactions persist correctly

  • validation rules trigger correctly

  • transactions commit atomically


#### 6.5.7.20 Model Text Panel

ModelTextLanguages: ["KERML"]. Scope: the Asset table selection — Asset,
DerivedAsset, Regime, Loss, and root GsnGoal features with HasLoss, HasGoal,
HasRegime, and Derives connectors per Section 3.7.6.



  \---



  ### 6.5.8  The Context Tool

  #### 6.5.8.1 Tool Purpose

The Context Tool is the primary Add-on Tool for defining and managing the
operational contexts of the active System of Interest (SoI).  It can graphicly depict and allow the User to modify the relationships between (Environment) and (:State), (:Asset) (:Loss), and (:Hazard).  
It is the authoritative workspace for:

* Creating and editing (:Environment) nodes in the active SoI.
* Assigning (:State) nodes to (:Environment) nodes via [:VALID_IN], establishing
which states are analytically relevant in each environment.
* Assigning StateSequence values to (:State) nodes to record lifecycle order
within the SoI.
* Managing (:Hazard) nodes and their relationships to (:Environment) and (:State).
* Allocating (:Loss) nodes to (Asset, Criticality, Assurance, Environment) tuples.
* Auto-generating (:Loss) and (:GsnGoal) nodes when new Environment-Asset
allocations are confirmed.

  The Context Tool bridges the Asset Manager Tool (which creates Assets and their
initial Criticality/Assurance-scoped Loss nodes without Environment dimension)
and the Loss Tool (which requires fully dimensioned Loss nodes with Environment
assignment before a tree can be built).

  The tool described here SHALL be branded at the top of the pop-up window as
"Context Tool".

  The Context Tool SHALL be visually and interactively consistent with other
SSTPA Add-on Tools.

  The Context Tool SHALL allow the User to:

1. View all (:Environment) nodes in the active SoI with their properties.
2. Create new (:Environment) nodes within the active SoI.
3. Edit (:Environment) node properties.
4. View all (:State) nodes in the active SoI with their properties and current
Environment assignments.
5. Assign (:State) nodes to (:Environment) nodes via [:VALID_IN].
6. Remove [:VALID_IN] assignments.
7. Assign and edit StateSequence values on (:State) nodes.
8. View all (:Hazard) nodes associated with each (:Environment) and (:State).
9. Create new (:Hazard) nodes and associate them to Environments and States.
10. Create new (:Hazard) nodes from Reference Data (clone from (:AK_Group) or
(:AK_Technique) nodes via the Reference Tool pattern).
11. View all (:Loss) nodes for the active SoI organized by Asset, with
Environment assignment status.
12. Assign a (:Loss) node to an (:Environment) via
(:Loss)-[:HAS_ENVIRONMENT]->(:Environment).
13. Remove a [:HAS_ENVIRONMENT] assignment from a (:Loss) node (de-allocate).
14. Auto-generate new (:Loss) and (:GsnGoal) nodes when a new
(Asset, Criticality, Assurance, Environment) tuple is completed.
15. Launch the Loss Tool directly for any fully allocated (:Loss) node.
16. Launch the Asset Manager Tool for any (:Asset) in the Loss allocation view.

    \---

    #### 6.5.8.2 Tool Wireframe

    The Context Tool window SHALL be divided into the following regions:

    **Top Bar**

    Displays "Context Tool" branding, active SoI HID and Name, and a mode selector
for the three modes defined in Section 6.5.8.5.

    **Left Panel — Environment List**

    A scrollable list of all (:Environment) nodes in the active SoI. Each row
displays: Environment HID, Name, number of assigned States, number of assigned
Hazards, and Loss allocation status (a count badge showing how many Loss nodes
have this Environment assigned vs. how many are unassigned for it).

    A toolbar above the list provides: "New Environment" button, Search field.

    Selecting an Environment in the list loads its detail into the right panel and
highlights it in the graphical view.

    **Right Panel — Mode-Specific Work Area**

    The right panel displays the content for the currently selected mode (see
Section 6.5.8.5). In Environment Detail Mode, it shows a mixed table and
graphical view for the selected Environment. In State-Environment Matrix Mode,
it shows the full assignment matrix. In Loss Allocation Mode, it shows the Loss
allocation table.

    The Context Tool window SHALL support resize and maximize.

    \---

    #### 6.5.8.3 Invocation

    The Context Tool SHALL be launched from the SSTPA Control Panel.

    If a Data Drawer is open for an (:Environment) node, the Context Tool SHALL
open in Environment Detail Mode centered on that Environment.

    If a Data Drawer is open for a (:State) node, the Context Tool SHALL open in
State-Environment Matrix Mode with that State's row highlighted.

    If a Data Drawer is open for a (:Loss) node, the Context Tool SHALL open in
Loss Allocation Mode with that Loss highlighted.

    If a Data Drawer is open for an (:Asset) node, the Context Tool SHALL open in
Loss Allocation Mode filtered to that Asset.

    If a Data Drawer is open for a (:Hazard) node, the Context Tool SHALL open in
Environment Detail Mode for the Environment associated with that Hazard.

    If no valid Data Drawer context exists, the Context Tool SHALL open in
Environment Detail Mode showing all Environments in the active SoI.

    Opening the Context Tool SHALL NOT change the current SoI.

    \---

    #### 6.5.8.4 Supported Node Context

    The Context Tool SHALL support invocation when the Data Drawer is open for:

* (:Environment)
* (:State)
* (:Loss)
* (:Asset)
* (:Hazard)
* (:System)

  The tool SHALL load on open:

* All (:Environment) nodes in the active SoI.
* All (:State) nodes in the active SoI with their StateSequence and
[:VALID_IN] relationships.
* All (:Hazard) nodes associated with Environments and States in the active SoI.
* All (:Asset) nodes in the active SoI with their Criticality and Assurance
properties.
* All (:Loss) nodes in the active SoI with their [:HAS_ENVIRONMENT] assignments
and AttackTreeStatus properties.
* All (:GsnGoal) nodes associated with (:Loss) nodes in the active SoI.

  \---

  #### 6.5.8.5 Modes of Operation

  The Context Tool SHALL support three modes selected via the top bar mode selector.

  **a. Environment Detail Mode**

  Environment Detail Mode is the default mode on open when no Loss or State
context is active.

  The left panel shows the Environment list. Selecting an Environment in the list
loads its detail in the right panel.

  The right panel SHALL display:

* **Properties panel (top):** Editable fields for all (:Environment) properties
per Section 3.3.10.3. "Edit" button stages changes; "Commit" persists.
* **State Assignments table (middle):** A table listing all (:State) nodes in
the active SoI with the following columns:

  * State HID
  * State Name
  * StateSequence value (editable inline)
  * Assigned to this Environment (checkbox, toggles [:VALID_IN] relationship)
  * Logic in tree (display-only: OR / SAND, set in the Loss Tool)

  The User SHALL be able to toggle the assignment checkbox to create or remove
[:VALID_IN] relationships between the State and the selected Environment.
Changes are staged; Commit persists all changes in a single transaction.

  The table SHALL be sorted by StateSequence ascending by default, with unset
sequences appearing at the bottom.

* **Hazard Associations table (bottom):** A table listing all (:Hazard) nodes
associated with the selected Environment via [:HAS_HAZARD]. Columns: Hazard
HID, Name, ShortDescription, action buttons (Remove, Open in Data Drawer).
An "Add Hazard" button opens a selector for existing Hazards or a creation
form for new ones.

  The right panel SHALL also display a summary graph for the selected Environment
showing: the Environment node, its associated States (with [:VALID_IN] edges),
and its associated Hazards (with [:HAS_HAZARD] edges). This graph is read-only
and updates to reflect staged changes before Commit.

  **b. State-Environment Matrix Mode**

  State-Environment Matrix Mode displays the full [:VALID_IN] assignment matrix
across all States and Environments in the active SoI.

  Rows: all (:State) nodes, sorted by StateSequence then HID.
Columns: all (:Environment) nodes, sorted by Name.

  Each cell is a checkbox indicating whether [:VALID_IN] exists between that State
and that Environment.

  A header column at the left of the matrix SHALL display per State:

* State HID
* State Name
* StateSequence (editable inline)

  A "Set Sequences" button above the matrix SHALL allow the User to set
StateSequence values by drag-reordering State rows; the tool assigns integer
values 0, 1, 2... based on row order and stages the update.

  Changes are staged; a single Commit persists all checkbox changes and
StateSequence updates in one transaction.

  The User MAY filter the matrix to:

* Show only States with at least one Environment assignment.
* Show only Environments that have at least one State assigned.
* Show unassigned States only.

  **c. Loss Allocation Mode**

  Loss Allocation Mode presents the full Loss node inventory for the active SoI
organized for Environment assignment.

  The mode SHALL display a hierarchical table with the following structure:

  **Asset row (collapsible, one per Asset):**

* Asset HID, Name, Criticality flags, Assurance flags
* Count of Loss nodes: total / with Environment assigned / without Environment assigned

  **Loss row (child of Asset row, one per Loss):**

* Loss HID
* Criticality (single true value, e.g. "Safety")
* Assurance (single true value, e.g. "Confidentiality")
* Environment column: shows assigned Environment Name and HID, or
"Unassigned" with a red indicator.
* AttackTreeStatus badge (NOT_BUILT, AUTO_GENERATED, ANALYST_REFINED,
BASELINED, INVALIDATED, EXPORTED)
* TreeIsValid indicator
* PathCount (if tree has been built)
* Action buttons: Assign Environment, Remove Environment, Open in Loss Tool

  The "Assign Environment" action for a Loss row SHALL open an Environment picker
showing only Environments in the active SoI. Selecting an Environment creates
the [:HAS_ENVIRONMENT] relationship and triggers auto-generation if required
(see Section 6.5.8.6).

  The User MAY filter the table to show:

* Only unassigned Loss nodes.
* Only assigned Loss nodes.
* Only nodes with AttackTreeStatus = INVALIDATED.
* Loss nodes for a specific Asset.
* Loss nodes for a specific Environment.

  A "Generate Missing" button at the top of the mode SHALL identify and
auto-generate any (Asset, Criticality, Assurance, Environment) tuples that have
an active [:VALID_IN] assignment between a State and the Environment but no
corresponding (:Loss) node. See Section 6.5.8.6 for the auto-generation rule.

  \---

  #### 6.5.8.6 Loss and Goal Auto-Generation Behavior

  The Context Tool is responsible for adding the Environment dimension to Loss
nodes and auto-generating new Loss and Goal nodes when that dimension is first
established.

  **Trigger condition:**

  Auto-generation SHALL be triggered when the User confirms any of the following
actions in the Context Tool:

* Assigning a (:Loss) node that has no [:HAS_ENVIRONMENT] to an (:Environment)
for the first time.
* Committing a new (:Environment) node where active Assets in the SoI would
produce new (Asset, Criticality, Assurance, Environment) tuples not yet
represented by (:Loss) nodes.
* Using the "Generate Missing" function in Loss Allocation Mode.

  **Generation rule:**

  For each distinct (Asset A, Criticality C, Assurance S, Environment E) tuple
where:

* (:Asset) A belongs to the active SoI.
* Criticality C is True on A.
* Assurance S is True on A.
* (:Environment) E belongs to the active SoI.
* No (:Loss) node currently exists in the SoI for this tuple.

  The Context Tool SHALL:

1. Create a new (:Loss) node with:

   * The single true Criticality property C set to True; all others False.
   * The single true Assurance property S set to True; all others False.
   * Name = "Compromise {A.Name} {C} {S} in {E.Name}".
   * ShortDescription = "Loss of {S} of {A.Name} ({C}) in the {E.Name} environment."
   * AttackTreeStatus = NOT_BUILT.
   * TreeIsValid = False. TreeHasRVs = False. PathCount = Null.
   * Valid HID and uuid per Section 3.3.8.
   * Owner and Creator = current authenticated User.
2. Create the relationship: (:Asset A)-[:HAS_LOSS]->(:Loss).
3. Create the relationship: (:Loss)-[:HAS_ENVIRONMENT]->(:Environment E).
4. Create a new Root (:GsnGoal) node with:

   * GoalStatement = "The {C} of {S} of {A.Name} in {E.Name} is acceptable."
   * Valid HID and uuid.
   * Owner and Creator = current authenticated User.
5. Create the relationship: (:Asset A)-[:HAS_GOAL]->(:GsnGoal).
6. All five operations SHALL be committed as a single ACID transaction.

   **User confirmation:**

   Before executing auto-generation, the Context Tool SHALL display a confirmation
dialog listing: the number of new (:Loss) nodes to be created, the number of new
(:GsnGoal) nodes to be created, and a summary table of the (Asset, Criticality,
Assurance, Environment) tuples to be covered.

   The User SHALL confirm or cancel. Auto-generation SHALL NOT proceed without
explicit confirmation.

   **Relationship to Asset Manager Tool:**

   The Asset Manager Tool creates (:Loss) and (:GsnGoal) nodes with Criticality and
Assurance set but without a [:HAS_ENVIRONMENT] relationship (pending Context
Tool allocation). This division of responsibility means:

* Asset Manager Tool: creates the (Asset, Criticality, Assurance) Loss skeleton.
* Context Tool: adds the Environment dimension and completes the Loss definition.

  The Context Tool SHALL NOT create duplicate (:Loss) nodes for tuples already
handled by the Asset Manager Tool. Instead it assigns an existing un-allocated
Loss to an Environment.

  If the Asset Manager Tool has already created a (:Loss) for
(Asset, Criticality, Assurance) but the User is allocating it to an Environment
for the first time, the Context Tool SHALL use the existing (:Loss) node and
add the [:HAS_ENVIRONMENT] relationship, rather than creating a new (:Loss).

  If an Asset has multiple Environments to allocate the same Criticality/Assurance
Loss to, the Context Tool SHALL create a new (:Loss) node for each additional
(Asset, Criticality, Assurance, Environment) combination beyond the first, since
each Environment is a distinct Loss scenario.

  \---

  #### 6.5.8.7 StateSequence Management

  StateSequence is a property on (:State) nodes that records the User-assigned
lifecycle position of each State within the SoI (e.g. Off=0, Boot=1, Ready=2,
Operate=3).

  The Context Tool is the primary interface for assigning and editing
StateSequence, although the State Tool and Data Drawer also display and edit it.

  **Assignment:**

  StateSequence SHALL be assigned via the State-Environment Matrix Mode using
the drag-reorder interface or inline editing, or via the State Assignments table
in Environment Detail Mode.

  StateSequence values are integers starting at 0. No uniqueness constraint is
enforced (two States may share a sequence value, representing parallel modes).

  **Display:**

  The State Assignments table in Environment Detail Mode SHALL always sort by
StateSequence ascending. States with no StateSequence value appear at the end
sorted by HID.

  The State-Environment Matrix Mode SHALL default to StateSequence sort order.
A secondary sort by HID resolves ties.

  **Propagation to Attack Tree:**

  When the Loss Tool builds or rebuilds an Attack Tree for a (:Loss) with States
organized in SAND (Sequential AND) order, it SHALL use StateSequence values
from the (:State) nodes to pre-populate SANDSequence properties on the
[:AT_RELATES_TO] edges. The Loss Tool SHALL use the StateSequence values for
States that have them; States without StateSequence values SHALL be placed at
the end of the SAND sequence with a SANDSequence value computed as the next
integer after the maximum assigned StateSequence in the Loss.

  \---

  #### 6.5.8.8 Hazard Management

  The Context Tool SHALL allow the User to manage (:Hazard) nodes and their
associations to (:Environment) and (:State) nodes.

  **Creating Hazards:**

  The User SHALL be able to create new (:Hazard) nodes directly from the
Environment Detail Mode using either:

* A "New Hazard" form for User-defined hazards.
* A "Clone from Reference" action that opens the Reference Tool in Assignment
Mode filtered to (:AK_Group) (Threat Actor) and (:AK_Technique) node types,
allowing the User to clone properties into a new (:Hazard) node using the
standard clone-and-own pattern.

  New (:Hazard) nodes SHALL be related to the selected (:Environment) via
(:Environment)-[:HAS_HAZARD]->(:Hazard) on creation.

  **Associating Hazards to States:**

  From the Environment Detail Mode, the User SHALL be able to associate an
existing (:Hazard) node to a (:State) node via (:State)-[:HAS_HAZARD]->(:Hazard).
This is done by selecting a Hazard in the Hazard Associations table and using a
"Also Applies to State" action that opens a State picker.

  **Removing Hazard Associations:**

  The User SHALL be able to remove [:HAS_HAZARD] relationships from both the
Environment and State levels. Removing a Hazard association SHALL NOT delete
the (:Hazard) node unless the node would become fully orphaned, in which case
the standard orphan-check and confirm-delete pattern SHALL apply.

  \---

  #### 6.5.8.9 Validation Requirements

  The Context Tool SHALL validate the following before Commit:

* New (:Environment) nodes have non-null Name.
* [:VALID_IN] relationships are between a (:State) and (:Environment) that both
belong to the same SoI.
* StateSequence values, when set, are non-negative integers.
* (:Loss) nodes being assigned an Environment do not already have a
[:HAS_ENVIRONMENT] relationship to a different Environment (one-to-one
constraint per Section 3.3.4.11).
* Auto-generated (:Loss) names are unique within the SoI (append a counter
suffix if a name collision is detected).

  The Context Tool SHALL display a warning (non-blocking) for:

* (:State) nodes with no [:VALID_IN] relationship to any (:Environment) in the
SoI. These States will not appear in any Attack Tree and may represent an
analytical gap.
* (:Environment) nodes with no States assigned via [:VALID_IN]. Loss Trees for
Loss nodes associated with this Environment will have no States at Tier 1
and cannot be built.
* (:Asset) nodes whose (Criticality, Assurance) Loss nodes have no Environment
assignments for any of the SoI's Environments. These Assets are not ready for
Loss analysis.

  \---

  #### 6.5.8.10 Data Drawer Integration

  Selecting a node in the Context Tool canvas or table SHALL populate the Data
Drawer with that node's properties if a Data Drawer is open.

  The Context Tool SHALL allow the User to open a Data Drawer for any displayed
node from its row or detail panel.

  Edits committed through the Data Drawer to an (:Environment) or (:State) node
SHALL be reflected in the Context Tool on the next refresh.

  \---

  #### 6.5.8.11 Backend Integration Requirements

  The Context Tool SHALL retrieve and mutate data through the Backend API.

  Required Backend capabilities:

* Retrieval of all (:Environment) nodes for the active SoI.
* Retrieval of all (:State) nodes for the active SoI with StateSequence and
[:VALID_IN] relationships.
* Retrieval of all (:Hazard) nodes associated to Environments and States.
* Retrieval of all (:Asset) nodes with Criticality and Assurance properties.
* Retrieval of all (:Loss) nodes with [:HAS_ENVIRONMENT] assignment status.
* Retrieval of all (:GsnGoal) nodes associated with (:Loss) nodes.
* Creation, update, and deletion of (:Environment) nodes.
* Creation and deletion of [:VALID_IN] relationships.
* Update of StateSequence property on (:State) nodes.
* Creation and deletion of [:HAS_HAZARD] relationships for Environment and State.
* Creation of (:Hazard) nodes.
* Creation and deletion of [:HAS_ENVIRONMENT] relationships on (:Loss) nodes.
* Transactional execution of auto-generation (new Loss + Goal + relationships).
* Detection of missing (Asset, Criticality, Assurance, Environment) tuples for
"Generate Missing" function.

  All Context Tool write operations SHALL be ACID compliant.

  \---

  #### 6.5.8.12 Performance Requirements

  The Context Tool SHALL:

* Load the full Environment list with State counts in under 2 seconds for SoIs
with up to 50 Environments, 50 States, and 200 Loss nodes.
* Render the State-Environment Matrix in under 2 seconds for matrix sizes up to
50 × 50.
* Complete auto-generation of up to 200 new Loss and Goal nodes in under 10
seconds.
* Display a progress indicator for operations taking more than 2 seconds.

  \---

  #### 6.5.8.13 Export Requirements

  The Context Tool SHALL support the following exports:

* **Environment Summary Report** (Markdown): lists all Environments, their
States (with StateSequence), and their Hazards.
* **State-Environment Matrix** (CSV): full assignment matrix with State rows,
Environment columns, and StateSequence column.
* **Loss Allocation Summary** (CSV): all Loss nodes with Asset HID, Criticality,
Assurance, Environment assignment status, and AttackTreeStatus.

  \---

  #### 6.5.8.14 Test and Verification Requirements

  The Context Tool SHALL be verified through test and analysis.

  The system SHALL verify that:

* New (:Environment) nodes are created with valid HID, uuid, and common properties.
* [:VALID_IN] relationship creation correctly links (:State) to (:Environment).
* [:VALID_IN] relationship removal correctly removes the relationship without
deleting either endpoint node.
* StateSequence assignment correctly updates the StateSequence property on the
(:State) node.
* Auto-generation creates the correct number of (:Loss) and (:GsnGoal) nodes for a
given set of Assets, Criticalities, Assurances, and Environments.
* Auto-generation transaction rolls back completely on any Backend failure.
* The tool correctly identifies and does not duplicate (:Loss) nodes that already
exist for a given tuple.
* (:Loss) nodes with an existing [:HAS_ENVIRONMENT] assignment cannot receive a
second [:HAS_ENVIRONMENT] relationship (one-Environment-per-Loss constraint).
* Validation warnings are correctly displayed for unassigned States and
unassigned Environments.
* The Loss Allocation Mode correctly reflects AttackTreeStatus badges from the
(:Loss).AttackTreeStatus property.
* Opening the Context Tool does not change the current SoI.

  \---

  #### 6.5.8.15 UX Design Principles

  The Context Tool SHALL follow the SSTPA Tools visual style and the guidelines
established for other Add-on Tools.

  The State Assignments table in Environment Detail Mode SHALL use the same
checkbox visual treatment as the Trace Tool matrix for consistency.

  The Loss Allocation Mode SHALL use color-coded AttackTreeStatus badges:

* NOT_BUILT: neutral grey.
* AUTO_GENERATED: blue.
* ANALYST_REFINED: green.
* BASELINED: gold/amber.
* EXPORTED: purple.
* INVALIDATED: red with "!" badge.

  Loss nodes with no Environment assignment SHALL be highlighted with an amber
"Unassigned" indicator.

  The StateSequence drag-reorder interface SHALL provide clear drag handles and
real-time visual feedback of the resulting sequence.

  The auto-generation confirmation dialog SHALL present the generation list in a
table format that is easy to scan, not as a long prose description.

#### 6.5.8.16 Model Text Panel

ModelTextLanguages: ["SYSML", "KERML"]. Environment definition displays
SysML 2.0 (#environment parts). Hazard management, [:VALID_IN] scoping, and
Loss allocation display KerML 1.0 (Hazard features, ValidIn and
LossEnvironment connectors). Edit mode follows the active pane.

  \---


  ### 6.5.9 Trace Tool

  #### 6.5.9.1 Tool Purpose

The Trace Tool is an Add-on Tool used to perform Asset Trace Analysis for a single (:Asset) in the current System of Interest (SoI). The User uses Asset Trace Analysis to systematically assigns state-scoped relationships between a selected (:Asset) and the (:Interface), (:System Function), and (:Component) nodes of the SoI.  That is to say a table with each (:State) having a column and  (:Interface), (:System Function), and (:Component) nodes related to the (:Asset) in rows.  This creates a new ephemeral entity at each cell of the matrix; the Asset-State-Entity (where "entity" can  (:Interface), (:System Function), and (:Component) nodes).  The Loss Tool will use these to construct Attack Trees.   


  The Trace Tool operates exclusively on Backend graph data. It SHALL NOT create or modify structured JSON files. All analysis outputs are persisted as graph nodes, graph relationships, and node properties in the Core Data Model.

  The Trace Tool SHALL allow the User to:

1. Select a single (:Asset) in the active SoI as the subject of the trace analysis.
2. View all (:State), (:Interface), (:SystemFunction), and (:Component) nodes in the active SoI in a two-dimensional trace matrix.
3. Assign [:HOLDS], [:TRANSPORTS], or [:USES] relationships between each entity and the Asset in the context of a specific State.
4. Clear a previously assigned relationship (restore cell to "none").
5. Create new (:Interface), (:SystemFunction), (:Component), and (:State) nodes within the active SoI from within the Trace Tool.
6. Stage and commit all relationship assignments, Criticality/Assurance inheritance, Connection inheritance, and protection Requirement generation as a single ACID transaction.
7. Review and manage superseded or invalidated trace relationships resulting from changes to the SoI after a prior trace commit.
8. View a per-entity criticality source summary showing which Assets contribute each active criticality flag.

   The tool described here SHALL be branded at the top of the pop-up window as "Trace Tool".

   The Trace Tool SHALL be visually and interactively consistent with other SSTPA Add-on Tools.

   \---

   #### 6.5.9.2 Tool Wireframe

   The Trace Tool window SHALL be divided into the following regions:

   **Top Bar — Asset Identity and Session Controls**

   The top bar SHALL display:

* "Trace Tool" branding label.
* Asset selector showing the HID and Name of the currently selected (:Asset).
* A "Change Asset" button to switch to a different Asset in the active SoI without closing the tool.
* A TraceStatus badge for the current trace session (NEW SESSION / PRIOR TRACE EXISTS / CONTAINS INVALIDATIONS).
* A toolbar with: Stage, Commit, Revert, Validate, Export, and New Entity controls.

  • Loss Tool Readiness indicator for the selected Asset: a summary badge showing
counts of Ready / Partial / Not Traced entities for the currently selected
Asset, computed from CURRENT trace data.

  • A "Launch Loss Tool" button that opens the Loss Tool for the first unbuilt
(:Loss) node associated with the selected Asset in the active SoI. If multiple
unbuilt Loss nodes exist for the Asset, the button opens a selector. The button
is enabled only when at least one Loss node exists for the Asset with
AttackTreeStatus = NOT_BUILT or INVALIDATED.





  **Left Panel — State Column Headers**

  The top row of the trace matrix. (:State) nodes for the active SoI are displayed as column headers across the top of the matrix. Each State column header SHALL display the State HID and Name.

  **Left Column — Entity Row Labels**

  The first column of the trace matrix. (:Interface), (:SystemFunction), and (:Component) nodes of the active SoI are displayed as row labels. Each row label SHALL display the entity type icon, HID, and Name. Rows SHALL be grouped by entity type: Interfaces first, then Functions, then Elements.

  **Matrix Body — Trace Assignment Cells**

  Each cell in the matrix represents the intersection of one entity row and one State column for the selected Asset. Each cell SHALL display the current relationship type assigned at that intersection for the Asset.

  Cell states:

* **Empty** — no relationship assigned (the default).
* **H** — [:HOLDS] assigned, rendered in the HOLDS color.
* **T** — [:TRANSPORTS] assigned, rendered in the TRANSPORTS color.
* **U** — [:USES] assigned, rendered in the USES color.
* **S** (strikethrough) — relationship exists but TraceStatus = SUPERSEDED.
* **!** (warning badge) — relationship exists but TraceStatus = INVALIDATED.



  **Loss Tool Readiness Column (rightmost column in matrix):**

  The matrix SHALL include a Loss Tool Readiness summary column as the rightmost
column, appearing after all State assignment columns. This column is per row
(per entity) and is not a State-specific cell.

  For each entity row, the Loss Tool Readiness column SHALL display a badge
indicating whether the Trace Tool data for this entity and the selected Asset is
sufficient for the Loss Tool to include the entity in an Attack Tree:

* **Ready** (green): at least one CURRENT [:HOLDS], [:TRANSPORTS], or [:USES]
relationship exists between this entity and the selected Asset.
* **Partial** (yellow): relationships exist but at least one has TraceStatus =
SUPERSEDED or INVALIDATED; re-trace recommended.
* **Not Traced** (grey): no relationship of any type exists between this entity
and the selected Asset.

  The Loss Tool Readiness column SHALL be toggleable (on/off) via a toolbar button.
It SHALL be visible by default.





  **Right Panel — Detail and Summary Panel**

  A collapsible panel docked to the right displaying:

* Selected cell detail: entity HID/Name, State HID/Name, current relationship, TraceDate, TraceVersion.
* Asset Criticality and Assurance summary (from the selected Asset).
* Per-entity Criticality Source summary (see Section 6.5.9.10).
* Staged changes list (changes not yet committed).

  The Trace Tool window SHALL support resize and maximize.

  \---

  #### 6.5.9.3 Invocation

  The Trace Tool SHALL be launched from the SSTPA Control Panel "Trace Tool" button.

  If a Data Drawer is open for an (:Asset) node, the Trace Tool SHALL open pre-loaded with that Asset as the trace subject.

  If a Data Drawer is open for an (:Interface), (:SystemFunction), (:Component), or (:State) node, the Trace Tool SHALL open the Asset selector and allow the User to choose the Asset to trace against that entity context. The entity from the Data Drawer SHALL be visually highlighted in the matrix after Asset selection.

  If no valid Data Drawer context exists, the Trace Tool SHALL open the Asset selector listing all (:Asset) nodes in the active SoI.

  If the active SoI has no (:Asset) nodes, the Trace Tool SHALL display an informational message and SHALL allow the User to navigate to the Asset Manager Tool.

  Opening the Trace Tool SHALL NOT change the current SoI.

  \---

  #### 6.5.9.4 Supported Node Context

  The Trace Tool SHALL operate on nodes within the active SoI only.

  The Trace Tool SHALL support invocation when the Data Drawer is open for:

* (:Asset) — opens pre-loaded with that Asset.
* (:Interface), (:SystemFunction), (:Component) — opens Asset selector with entity highlighted after selection.
* (:State) — opens Asset selector with the State column highlighted after selection.
* (:System) — opens Asset selector for the active SoI.

  The Trace Tool SHALL load the following node sets from the Backend on open:

* The selected (:Asset) node and its Criticality and Assurance properties.
* All (:State) nodes in the active SoI via (:System)-[:EXHIBITS]->(:State).
* All (:Interface) nodes in the active SoI via (:System)-[:HAS_INTERFACE]->(:Interface).
* All (:SystemFunction) nodes in the active SoI via (:System)-[:HAS_FUNCTION]->(:SystemFunction).
* All (:Component) nodes in the active SoI via (:System)-[:HAS_ELEMENT]->(:Component).
* All existing [:HOLDS], [:TRANSPORTS], and [:USES] relationships from any entity in the active SoI to the selected Asset.
* All (:Requirement) nodes with text referencing the selected Asset that are related to entities in the active SoI.
* The (:Connection) nodes associated with any (:Interface) in the active SoI via [:PARTICIPATES_IN].

  \---

  #### 6.5.9.5 Modes of Operation

  The Trace Tool SHALL support the following modes:

  **a. Trace Entry Mode (default)**

  Trace Entry Mode presents the full two-dimensional trace matrix and is the primary working mode.

  The matrix SHALL display all entities (rows) against all States (columns) for the selected Asset.



  The User MAY:

* Click any cell to cycle through relationship states: empty → HOLDS → TRANSPORTS → USES → empty.
* Right-click any cell to open a context menu with explicit options: Set to HOLDS, Set to TRANSPORTS, Set to USES, Clear.
* Click any row label to open the Data Drawer for that entity without leaving the Trace Tool.
* Click any column header to open the Data Drawer for that State without leaving the Trace Tool.
* Sort rows by entity type, HID, Name, or number of assigned relationships.
* Filter rows to show: All entities, Only assigned entities, Only unassigned entities, Only invalidated rows.
* Filter columns to show: All States, Only States with at least one assignment.

  • Right-clicking any column header (State) SHALL include the option "View in
Context Tool" which launches the Context Tool in State-Environment Matrix Mode
with that State's row highlighted, allowing the User to verify or set the
State's [:VALID_IN] assignments without leaving the Trace Tool session.



  The Top bar SHALL include a "Loss Tool Readiness" toggle when enabled, shows the Loss Tool
Readiness column in the matrix and the Asset-level readiness badge in the
top bar.



  Cell assignment in Trace Entry Mode is staged. Changes SHALL appear visually as staged (distinct styling) and SHALL NOT be committed to the Backend until the User explicitly clicks "Commit."





  **b. Validation Mode**

  Validation Mode inspects the current trace session and prior trace data for consistency issues.

  The mode SHALL report:

* **Unassigned Entities**: entities with no relationship to the Asset in any State.
* **Entities Without Requirements**: entities with a relationship to the Asset but no protection Requirement generated.
* **Invalidated Relationships**: relationships where TraceStatus = INVALIDATED because the referenced entity or State no longer exists with the same HID (see Section 6.5.9.9).
* **Superseded Relationships**: relationships where TraceStatus = SUPERSEDED by a more recent trace commit.
* **Criticality Inconsistency**: entities where the computed criticality (derived from all current Asset relationships) differs from the stored criticality properties on the entity (indicating a stale prior trace).
* **Orphaned Requirements**: protection Requirements that were generated by a prior trace for the selected Asset but whose owning entity no longer has a relationship to the Asset.
* **Duplicate Protection Requirements**: cases where an entity has more than one protection Requirement for the same Asset Assurance property (indicating redundant generation from multiple trace sessions).

  • **Loss Trees With No Trace Data**: (:Loss) nodes in the active SoI whose
associated (:Asset) has no CURRENT trace relationships to any entity in any
State. These Loss trees cannot be built. Displays Asset HID, Loss HID, and
a "Fix in Trace Entry Mode" action.

  • **Loss Trees With Partial Trace Data**: (:Loss) nodes whose associated (:Asset)
has CURRENT trace relationships for some States but not all States that have
[:VALID_IN] to the Loss's Environment. The tree can be built but may be
incomplete. Displays affected State HIDs and Loss HID.

* • **States Not Assigned to Any Environment**: (:State) nodes in the active SoI
that have no [:VALID_IN] relationship to any (:Environment). Entities in these
States will not appear in any Attack Tree. A "Fix in Context Tool" action
launches the Context Tool in State-Environment Matrix Mode.



  Each finding SHALL display the affected entity HID, State HID (where applicable), finding type, and a recommended action.

  Validation Mode SHALL allow the User to:

* Navigate to any finding's entity or State in the main GUI.
* Mark an invalidated relationship as Acknowledged (does not change TraceStatus but suppresses it from future validation reports).
* Initiate a re-trace from within Validation Mode.





  **c. Criticality Review Mode**

  Criticality Review Mode presents a per-entity summary of all Asset relationships contributing to each entity's current criticality state.

  For each (:Interface), (:SystemFunction), and (:Component) in the active SoI, the mode SHALL display:

* Entity HID and Name.
* A row for each Criticality flag (SafetyCritical, MissionCritical, FlightCritical, SecurityCritical) showing:

  * Current value (True/False) on the entity.
  * Source Assets contributing that flag (list of Asset HIDs and Names whose relationships have inherited this flag to the entity).
  * Whether the flag would be True after removing any specific Asset relationship.

  This mode supports the use case described in Section 6.5.9.10 where an Asset is removed from the trace but the entity remains critical due to other Assets.

  **d. New Entity Mode**

  New Entity Mode allows the User to create new (:Interface), (:SystemFunction), (:Component), and (:State) nodes within the active SoI without leaving the Trace Tool.

  On creation, the new node SHALL:

* Immediately appear as a new row (or column for State) in the trace matrix.
* Follow all standard SSTPA staged editing and Commit rules.
* Receive valid HID, uuid, and common properties per Section 3.3.8.
* Be related to the active SoI via the appropriate [:HAS_INTERFACE], [:HAS_FUNCTION], [:HAS_ELEMENT], or [:EXHIBITS] relationship.

  Entity creation in New Entity Mode SHALL be committed separately from trace relationship assignments unless the User explicitly chooses to combine them in a single commit.

  **e. Export Mode**

  Export Mode generates report-oriented outputs of the current trace matrix and findings. See Section 6.5.9.12.

  \---

  #### 6.5.9.6 Trace Commit Logic

  When the User commits a Trace Entry Mode session, the Trace Tool SHALL execute the following operations as a single ACID transaction. The transaction SHALL fully roll back on any failure; no partial state SHALL be committed.

  **Phase 1 — Relationship Supersession**

  For each entity-to-Asset relationship of type [:HOLDS], [:TRANSPORTS], or [:USES] that already exists in the Backend for the selected Asset:

* If the relationship is for the same (entity, Asset) pair but a different State context (different TraceStateHID) than the newly staged assignment, set TraceStatus = SUPERSEDED on the existing relationship.
* If the relationship is for the same (entity, State, Asset) triple as the newly staged assignment but is a different relationship type (e.g., prior was [:HOLDS], new is [:USES]), set TraceStatus = SUPERSEDED on the existing relationship. The new relationship is created as a new graph relationship with TraceStatus = CURRENT.
* If the cell was cleared by the User (set back to empty), set TraceStatus = SUPERSEDED on any existing relationship for that (entity, State, Asset) triple. No new relationship is created.

  **Phase 2 — Relationship Creation**

  For each cell in the matrix that the User has staged with a relationship assignment:

* Create the appropriate new typed relationship: (entity)-[:HOLDS | :TRANSPORTS | :USES]->(Asset).
* Set TraceStateHID to the HID of the State represented by that column.
* Set TraceDate to the commit timestamp.
* Set TraceVersion to one greater than the maximum existing TraceVersion on any relationship between this entity and this Asset.
* Set TraceStatus = CURRENT.
* Set TraceSessionID to the uuid generated for this commit session.

  **Phase 3 — Criticality and Assurance Inheritance**

  For each entity that has at least one CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to any Asset in the active SoI (not just the Asset being committed):

  Compute the union of all Criticality and Assurance properties across all Assets to which the entity has a CURRENT relationship.

  Set the entity's Criticality and Assurance properties to the logical OR of that union:

* If any related Asset has SafetyCritical = True, the entity's SafetyCritical SHALL be True.
* If any related Asset has MissionCritical = True, the entity's MissionCritical SHALL be True.
* If any related Asset has FlightCritical = True, the entity's FlightCritical SHALL be True.
* If any related Asset has SecurityCritical = True, the entity's SecurityCritical SHALL be True.
* If any related Asset has Confidentiality = True, the entity's Confidentiality SHALL be True.
* If any related Asset has Availability = True, the entity's Availability SHALL be True.
* If any related Asset has Authenticity = True, the entity's Authenticity SHALL be True.
* If any related Asset has NonRepudiation = True, the entity's NonRepudiation SHALL be True.
* If any related Asset has Certifiable = True, the entity's Certifiable SHALL be True.
* If any related Asset has Privacy = True, the entity's Privacy SHALL be True.
* If any related Asset has Trustworthy = True, the entity's Trustworthy SHALL be True.

  Level properties (SafetyLevel, MissionLevel, FlightLevel, SecurityLevel) SHALL be set to the maximum integer value across all contributing Assets for each Criticality dimension.

  If an entity has NO CURRENT relationships to any Asset (e.g., all relationships were superseded or cleared in this commit), all Criticality and Assurance properties SHALL be recomputed from the remaining CURRENT relationships. If there are none, all flags SHALL be set to False and all Level properties SHALL be set to Null.

  **Phase 4 — Connection Criticality Inheritance**

  For each (:Interface) that has at least one CURRENT relationship to any Asset in the active SoI:

  For each (:Connection) the (:Interface) participates in via [:PARTICIPATES_IN]:

  Apply the same union logic from Phase 3 to the (:Connection) node's Criticality and Assurance properties. The (:Connection) SHALL inherit the OR-union of all Criticality and Assurance flags from all (:Interface) nodes that participate in it and have CURRENT Asset relationships.

  **Phase 5 — Protection Requirement Generation**

  For each entity that has at least one CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to the committed Asset:

  For each Assurance property on the committed Asset that is True (e.g., Confidentiality = True):

  Check whether a protection Requirement with the following canonical text already exists on the entity:

  > `"{entity Name} SHALL protect the {Assurance property label} of {Asset Name}."`

  Where:

* `{entity Name}` is the Name property of the (:Interface), (:SystemFunction), or (:Component).
* `{Assurance property label}` is the human-readable label of the Assurance property (e.g., "Confidentiality", "Availability", "Integrity", "Authenticity", "Non-Repudiation", "Privacy", "Trustworthiness").
* `{Asset Name}` is the Name property of the (:Asset).

  If a Requirement with this exact canonical text already exists on the entity (matched by RStatement text), do NOT create a duplicate. The existing Requirement is considered current.

  If no such Requirement exists, create a new (:Requirement) node with:

* RStatement = the canonical text above.
* VMethod = Inspection (default).
* Orphan = False (it is immediately related to the entity).
* Barren = True (no Verification yet assigned).
* Owner and Creator = current authenticated User.
* HID assigned per Section 3.3.8.

  Relate the new (:Requirement) to the entity via (entity)-[:HAS_REQUIREMENT]->(:Requirement).

  Relate the new (:Requirement) to the SoI (:Purpose) via (:Purpose)-[:HAS_REQUIREMENT]->(:Requirement).

  **Phase 6 — Orphaned Requirement Detection**

  After Phase 5, check for protection Requirements for the committed Asset that are now orphaned:

  A protection Requirement for Asset A on Entity E is orphaned if Entity E has no CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to Asset A.

  For each such orphaned protection Requirement:

* Set Orphan = True on the (:Requirement) node.
* Do NOT delete the Requirement. Deletion is an explicit User action.
* The Requirement will appear in Validation Mode findings as "Orphaned Requirements."

  \---

  #### 6.5.9.7 Relationship Properties

  The three relationship types [:HOLDS], [:TRANSPORTS], and [:USES] between entity nodes and (:Asset) nodes SHALL carry the metadata properties defined in the Preliminary section above: TraceStateHID, TraceDate, TraceVersion, TraceStatus, and TraceSessionID.

  Additionally, all three relationship types MAY carry:

|Property|Type|Edit|Description|
|-|-|-|-|
|TraceNote|String|edit|Optional analyst annotation on this specific relationship.|
|AcknowledgedInvalidation|Boolean|edit|True if the analyst has acknowledged an INVALIDATED status and accepted it as a known condition. Default: False.|

\---

#### 6.5.9.8 Trace Matrix Cell Interaction Rules

Each cell in the trace matrix represents the relationship between one entity (row) and one State (column) for the selected Asset.

The following rules govern cell interaction:

* A cell may carry at most one of: empty, HOLDS, TRANSPORTS, or USES for a given (entity, State, Asset) triple.
* Clicking a cell cycles through: empty → HOLDS → TRANSPORTS → USES → empty.
* Right-clicking presents the explicit relationship picker and a "Clear" option.
* A cell that was previously committed with a relationship SHALL show the prior relationship type with CURRENT styling.
* A staged change to a committed cell SHALL show the new relationship type in staged styling (visually distinct from committed).
* Reverting (via the Revert button or Revert All) SHALL restore all cells to their last committed state.
* The entire staged session may be reverted before commit without any Backend mutation.

The matrix SHALL display a per-row summary badge showing:

* Number of States in which the entity has a CURRENT relationship to the selected Asset.
* Number of INVALIDATED or SUPERSEDED relationships for that entity and Asset.

The matrix SHALL display a per-column summary badge showing:

* Number of entities that have a CURRENT relationship to the selected Asset in that State.

\---

#### 6.5.9.9 Trace Invalidation and Re-Trace

System development is iterative. After a trace is committed, the SoI may change: entities may be renamed, deleted, or replaced; States may be added or removed. This creates a class of trace consistency problem where committed relationships reference nodes that have been modified or no longer exist.

**Invalidation detection:**

The Trace Tool SHALL detect the following invalidation conditions on open and on explicit "Check Validity" command:

* An entity node referenced by a CURRENT relationship no longer exists in the active SoI (node deleted).
* A State node referenced by TraceStateHID in a CURRENT relationship no longer exists in the active SoI.
* An entity's Name or ShortDescription has changed since the last trace commit (indicating possible scope change; generates a Warning, not an INVALIDATED status).
* A (:Connection) that was subject to criticality inheritance no longer has participating (:Interface) nodes (generates a Warning).

When an invalidation condition is detected:

* Set TraceStatus = INVALIDATED on the affected relationship.
* The cell displays a "!" warning badge in the matrix.
* The condition appears in Validation Mode findings.

**Re-Trace behavior:**

When the User commits a new trace session for the same Asset, the commit logic in Section 6.5.9.6 handles all supersession. A new trace effectively supersedes all prior CURRENT relationships for the same entity-Asset pairs that are touched in the new session.

The User is NOT required to reassign every cell in a re-trace. Only cells explicitly changed or cleared are affected. Cells not touched in the new session retain their prior CURRENT relationship unchanged.

**Criticality recomputation on re-trace:**

Because an entity's criticality is the OR-union of all CURRENT Asset relationships (not just the Asset being traced), removing a relationship to one Asset SHALL trigger recomputation of criticality from all remaining CURRENT relationships across all Assets. The Trace Tool SHALL recompute Phase 3 (Criticality Inheritance) across all Assets, not just the Asset being committed, to ensure that removing one Asset's contribution does not leave stale criticality flags when the entity retains relationships to other Assets.

Example: If a (:SystemFunction) has [:USES] relationships to both AssetA (FlightCritical = True) and AssetB (FlightCritical = True), and the User removes the relationship to AssetA, the (:SystemFunction) SHALL remain FlightCritical = True owing to AssetB. If the User also removes the relationship to AssetB, then FlightCritical SHALL be set to False.

The Criticality Review Mode (Section 6.5.9.5c) provides the User with visibility into which Assets are contributing each criticality flag before committing a removal.

\---

#### 6.5.9.10 Criticality Source Tracking

The Trace Tool SHALL maintain sufficient information in the Backend to answer the question: "Why is entity E marked as FlightCritical (or any other criticality flag)?"

Because criticality is stored as a property on the entity node and is computed by OR-union of all contributing Asset relationships, the entity property alone does not record the sources. The TraceStateHID, TraceDate, TraceVersion, and TraceStatus properties on each [:HOLDS], [:TRANSPORTS], and [:USES] relationship provide the full audit trail.

The Backend SHALL support a query that, for any given entity and Criticality property, returns all CURRENT Asset relationships to that entity whose source Asset has that Criticality flag set to True. This query result is displayed in Criticality Review Mode.

The Trace Tool SHALL use this query to build the per-entity Criticality Source Summary in the Detail and Summary Panel.

The Criticality Source Summary SHALL display for each entity:

* Each Criticality flag that is True on the entity.
* The list of Asset HIDs and Names responsible for that flag (i.e., Assets with CURRENT relationships to the entity where the Asset has that flag = True).
* Whether removing any single Asset relationship would change the flag value (i.e., is the flag singly sourced or multiply sourced).

\---

#### 6.5.9.11 New Entity Creation Rules

The Trace Tool MAY be used to create new (:Interface), (:SystemFunction), (:Component), and (:State) nodes within the active SoI.

New entity creation SHALL:

* Open a creation form within the Trace Tool window (modal overlay or side panel).
* Require at minimum: Name, ShortDescription.
* Assign valid HID, uuid, Owner, Creator, Created, LastTouch per Section 3.3.8.
* Relate the new entity to the active SoI via the correct [:HAS_INTERFACE], [:HAS_FUNCTION], [:HAS_ELEMENT], or [:EXHIBITS] relationship.
* Be committed to the Backend as a separate ACID transaction before the entity is available for trace assignment.
* Immediately add the new entity as a row (or column for State) in the trace matrix after creation commit.

New entity creation SHALL follow the same staged editing and Commit confirmation model as all other SSTPA Tool node creation operations.

The Trace Tool SHALL NOT create (:Asset) nodes. Asset creation is the responsibility of the Asset Manager Tool (Section 6.5.7).

\---

#### 6.5.9.12 Export Requirements

The Trace Tool SHALL support export of the following outputs:

**Trace Matrix Export:**

* A tabular representation of the current trace matrix showing all entity rows and State columns, with the current relationship type (HOLDS, TRANSPORTS, USES, or empty) in each cell, for the selected Asset.
* Export formats: CSV and Markdown.
* The export SHALL include the Asset HID, Asset Name, SoI System HID and Name, and the TraceDate of the most recent commit session.

**Trace Analysis Report:**

* A structured document summarizing the full trace analysis for the selected Asset.
* Content: Asset identity and Criticality/Assurance properties; entity-by-entity summary of all CURRENT relationships (type, State context, TraceDate); Criticality Source Summary per entity; list of generated protection Requirements (with entity, Assurance dimension, and Requirement HID); Validation Mode findings.
* Export formats: Markdown and JSON.

**Criticality Source Report:**

* A per-entity report for the entire active SoI showing, for each Criticality and Assurance flag that is True on each entity, the contributing Asset(s).
* Export format: CSV and Markdown.
* Intended for use as certification evidence.

Exports SHALL be written to the local file system at a path selected by the User through a standard file save dialog.

\---

#### 6.5.9.13 Backend Integration Requirements

The Trace Tool SHALL retrieve and mutate data through the Backend API.

Required Backend capabilities:

* Retrieval of all (:Asset) nodes for the active SoI.
* Retrieval of all (:State), (:Interface), (:SystemFunction), and (:Component) nodes for the active SoI.
* Retrieval of all existing [:HOLDS], [:TRANSPORTS], and [:USES] relationships between any entity in the active SoI and a specified Asset, including all relationship properties.
* Creation of [:HOLDS], [:TRANSPORTS], and [:USES] relationships with required properties.
* Update of TraceStatus on existing relationships (SUPERSEDED, INVALIDATED).
* Retrieval and update of Criticality and Assurance properties on (:Interface), (:SystemFunction), (:Component), and (:Connection) nodes.
* Retrieval of all (:Connection) nodes for which an (:Interface) in the active SoI has a [:PARTICIPATES_IN] relationship.
* Creation of (:Requirement) nodes with all required properties.
* Creation of (entity)-[:HAS_REQUIREMENT]->(:Requirement) relationships.
* Creation of (:Purpose)-[:HAS_REQUIREMENT]->(:Requirement) relationships.
* Existence check for protection Requirements by RStatement text on a given entity.
* Update of Orphan property on (:Requirement) nodes.
* Creation of new (:Interface), (:SystemFunction), (:Component), and (:State) nodes with SoI membership relationships.
* Query: for a given entity, return all CURRENT Asset relationships and the Asset Criticality/Assurance properties for criticality source computation.
* Transactional execution of the full six-phase commit (Section 6.5.9.6) as a single ACID transaction.

• Loss Tool Readiness query: for a given Asset and SoI, return per-entity counts
of CURRENT, SUPERSEDED, and INVALIDATED trace relationships, grouped by entity
type (Interface, Function, Element), used to populate the Loss Tool Readiness
column and badge.



All Trace Tool write operations SHALL be ACID compliant.

\---

#### 6.5.9.14 Performance Requirements

The Trace Tool SHALL:

* Load the full trace matrix for a SoI with up to 20 States, 100 Interfaces, 100 Functions, and 100 Elements in under 3 seconds.
* Execute a full six-phase trace commit for up to 100 entity-Asset assignments in under 5 seconds.
* Display a progress indicator for commit operations taking more than 2 seconds.
* Complete Validation Mode analysis in under 3 seconds for the stated matrix size.
* Support paginated row loading for SoIs with more than 300 entities.
* Maintain UI responsiveness during all Backend operations using asynchronous query execution where necessary.

All trace commit operations SHALL be atomic. Partial commit on failure is not permitted.

\---

#### 6.5.9.15 Test and Verification Requirements

The Trace Tool SHALL be verified through test and analysis.

The system SHALL verify that:

* Opening with an Asset in the Data Drawer pre-loads the correct Asset.
* Opening with no context displays the Asset selector.
* The trace matrix correctly shows all Interfaces, Functions, and Elements in the active SoI as rows.
* The trace matrix correctly shows all States in the active SoI as columns.
* Cell cycling correctly sequences: empty → HOLDS → TRANSPORTS → USES → empty.
* Committing a HOLDS assignment creates a [:HOLDS]->(Asset) relationship with correct TraceStateHID, TraceDate, TraceVersion = 1 (for new), TraceStatus = CURRENT.
* Committing a second trace for the same (entity, State, Asset) triple sets the prior relationship TraceStatus = SUPERSEDED and creates a new CURRENT relationship.
* Clearing a cell sets the prior relationship TraceStatus = SUPERSEDED and creates no new relationship.
* Criticality inheritance correctly sets SafetyCritical = True on an entity after the entity gains a USES relationship to an Asset with SafetyCritical = True.
* Criticality inheritance correctly leaves SafetyCritical = True on an entity when one of two Asset relationships (both contributing SafetyCritical = True) is removed, while the other remains CURRENT.
* Criticality inheritance correctly sets SafetyCritical = False on an entity after its last Asset relationship contributing SafetyCritical = True is removed.
* Connection criticality inheritance sets Criticality properties on a (:Connection) when any participating (:Interface) gains an Asset relationship.
* Protection Requirement generation creates a Requirement with canonical RStatement text on the correct entity.
* Protection Requirement generation does NOT create a duplicate Requirement if one with the same RStatement already exists on the entity.
* Protection Requirement generation correctly creates the (:Purpose)-[:HAS_REQUIREMENT] relationship.
* Orphaned Requirement detection sets Orphan = True when an entity loses all CURRENT relationships to the Asset that generated the Requirement.
* Invalidation detection correctly sets TraceStatus = INVALIDATED when a referenced entity is deleted from the SoI.
* Re-trace correctly recomputes criticality from all CURRENT Asset relationships across all Assets, not only the committed Asset.
* New entity creation from within the Trace Tool creates the correct node type with SoI membership and immediately adds it to the matrix.
* The Criticality Source Summary correctly identifies all contributing Assets for each True criticality flag.
* Validation Mode correctly identifies all finding types: unassigned entities, entities without Requirements, invalidated relationships, orphaned Requirements, and duplicate protection Requirements.
* All six commit phases roll back completely on any Backend error with no partial state.
* Exports contain correct data for the trace matrix, analysis report, and criticality source report.
* Opening the Trace Tool does not change the current SoI.

• Loss Tool Readiness column correctly shows Ready for entities with CURRENT
trace relationships, Partial for entities with SUPERSEDED or INVALIDATED
relationships, and Not Traced for entities with no relationships.

• Loss Tool Readiness badge in the top bar correctly counts Ready, Partial,
and Not Traced entities for the selected Asset.

• "Launch Loss Tool" button is enabled when at least one Loss node for the
selected Asset exists with AttackTreeStatus = NOT_BUILT or INVALIDATED.

• "View in Context Tool" context menu action correctly opens the Context Tool
in State-Environment Matrix Mode for the selected State column.



\---

#### 6.5.9.16 UX Design Principles

The Trace Tool SHALL render the trace matrix clearly and efficiently to support rapid expert analysis.

The matrix SHALL use a compact grid layout with fixed row-label and column-header regions that scroll independently of the matrix body, allowing large matrices to be navigated without losing entity or State context.

Cell relationship types SHALL be visually distinguished using both color and a short text label (H, T, U) so that the matrix is interpretable in monochrome and accessible to users with color vision deficiencies.

Staged (uncommitted) changes SHALL be visually distinct from committed relationships (e.g., italic label, dashed border, or distinct background shade) so the User always knows the current commit state of each cell.

SUPERSEDED and INVALIDATED cells SHALL use clearly distinct visual treatments:

* SUPERSEDED: muted, struck-through label.
* INVALIDATED: warning color with "!" badge.

The Criticality Source Summary panel SHALL use a compact tabular format showing only True criticality flags and their contributing Assets to avoid information overload.

The tool SHALL provide a row-height toggle between compact (HID + Name truncated) and expanded (HID + Name + ShortDescription) to support both quick scanning and detailed review.

The Commit button SHALL require a single explicit click and SHALL display a pre-commit summary dialog identifying: the number of new relationships, the number of superseded relationships, the number of new Requirements to be generated, and the number of Orphaned Requirements to be flagged. The User SHALL confirm before the commit executes.

Destructive operations such as clearing a relationship that has generated Requirements SHALL display a warning identifying the associated Requirements that will be orphaned on commit.


#### 6.5.9.17 Model Text Panel

ModelTextLanguages: ["KERML"], read-only in this version. Scope: the active
trace matrix — Holds / Transports / Uses connectors with trace metadata
attribute values for TraceStatus = CURRENT (Section 3.7.2). Trace mutations
SHALL continue to be made only through the matrix and its Commit
transaction.

\---



### 6.5.10  The Loss Tool

In the body of evidence needed for certification, nothing is more important than
the analysis of Loss and the identification and approval of Residual
Vulnerabilities. All Assets will have Residual Vulnerabilities. The purpose of
the Loss Tool is to develop a Loss View that is both comprehensible and
defensible to system stakeholders and in particular to certification authorities.

The Loss Tool is the terminal analytical Add-on Tool in the SSTPA workflow,
consuming the outputs of the Context Tool, the State Tool, the Trace Tool, and
the Attack Tool to construct, visualize, analyze, and document Structured Attack
Trees for individual (:Loss) nodes.

\---

### 6.5.10.1 Tool Purpose

The Loss Tool is an Add-on Tool used to construct, visualize, analyze, and
document Structured Attack Trees for a single (:Loss) node in the active System
of Interest (SoI). Each Attack Tree is a Directed Acyclic Graph (DAG) rooted at
a (:Loss) node that decomposes the Loss into all paths by which the compromise of
the Asset's Assurance could occur in the designated Environment.

The Loss Tool synthesizes outputs from four upstream tools:

* **Context Tool** — defines which States are valid in the Loss's Environment
via [:VALID_IN] and provides StateSequence ordering.
* **State Tool** — provides State lifecycle context and StateSequence values.
* **Trace Tool** — defines which entities (Interface, Function, Element) have
CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationships to the Loss's Asset
in which States, and propagates Criticality/Assurance to those entities.
* **Attack Tool** — populates (:Attack) nodes and associates them to entities
via [:EXPLOITS], builds Attack hierarchies, and assigns leaf metric values.

The Loss Tool operates on exactly one (:Loss) node at a time. All Attack Tree
data for that Loss is stored in the Backend as [:AT_RELATES_TO] graph
relationships (semantic source of truth) and in the AttackTreeJSON property on
the (:Loss) node (layout and validation snapshot).

The tool described here SHALL be branded at the top of the pop-up window as
"Loss Tool".

The Loss Tool SHALL be visually and interactively consistent with other SSTPA
Add-on Tools and SHALL apply the SSTPA Tools visual style defined in the
Frontend specification.

The Loss Tool SHALL allow the User to:

1. View the Trace Coverage for the Loss's Asset as a read-only prerequisite
check before building or inspecting the Attack Tree.
2. Auto-build an Attack Tree from the graph data produced by the upstream tools.
3. View and navigate the full Attack Tree diagram organized in tiers T0 through
T6+, conforming to Structured Attack Tree Analysis conventions.
4. Modify the Attack Tree: add and remove Attacks, add and remove Countermeasures,
change logical operators (AND, OR, SAND), set State SAND ordering.
5. Tailor Attack nodes and edges out of the tree for a specific analytical context,
with a documented reason.
6. Associate existing and new (:Countermeasure) nodes to (:Attack) nodes.
7. Create new (:Countermeasure) nodes and associate them inline during tree editing.
8. Mark (:Countermeasure) nodes as complete blockers with a documented reason.
9. Define and assign configurable metric systems for quantitative Attack Tree
analysis (e.g. attack cost, attack probability).
10. Enumerate all attack paths (root-to-leaf sequences) and sort them by metric
value.
11. Identify, review, and document Residual Vulnerabilities (RVs).
12. Acknowledge Allowed Residual Vulnerabilities with documented reasons for
certification authority review.
13. Create Derived Assets at Attack Tree terminal positions, auto-generating new
Loss scopes for those Assets.
14. Navigate directly from a Derived Asset terminal node to its spawned Loss tree.
15. Detect and surface validation findings when Core Data has changed since the
tree was last built, using the validation snapshot embedded in AttackTreeJSON.
16. Export Attack Tree diagrams, path reports, Residual Vulnerability records, and
certification-ready summaries.
17. Navigate to related tools (Trace Tool, Attack Tool, Context Tool, Goal Keeper
Tool) directly from the Loss Tool.

\---

### 6.5.10.2 Tool Wireframe

The Loss Tool window SHALL be organized into five regions: Top Bar, Canvas,
Left Panel, Right Panel, and Bottom Bar.

\---

**Top Bar — Loss Identity, Status, and Controls**

The top bar SHALL always display the following, left to right:

* "Loss Tool" branding label.
* Loss HID (monospaced, copyable).
* Loss Name.
* Asset HID and Name (abbreviated; full name in tooltip).
* Environment Name and HID.
* Criticality label — the single active Criticality value (e.g. "Safety Critical",
"Flight Critical").
* Assurance label — the single active Assurance value (e.g. "Confidentiality",
"Availability").
* Tree Validity badge: VALID (green) / WARNING (amber) / INVALID (red) /
NOT_BUILT (grey). Reflects TreeIsValid, metric pass/fail, and presence of
unacknowledged RVs.
* AttackTreeStatus badge: NOT_BUILT / AUTO_GENERATED / ANALYST_REFINED /
BASELINED / EXPORTED / INVALIDATED.
* Path Count: "N paths" when PathCount is computed; "--" when not built.
* AttackTreeVersion: "v{N}".

The top bar SHALL also display the following mode selector and toolbar controls:

**Mode selector** (tab-style or segmented control):

* Trace Coverage
* Attack Tree Construction
* Attack Path Analysis

**Toolbar buttons** (left to right):

* Stage (activates when changes are pending but not yet staged)
* Commit (activates when staged changes are present)
* Revert (activates when staged changes are present; reverts all staged changes)
* Rebuild Tree (always active when Loss has a valid Environment assignment;
regenerates the entire tree from current graph data)
* Validate (runs full validation and populates Validation Findings panel)
* Define Metrics (opens Metric Editor panel)
* Export (opens export picker)
* Launch Context Tool (navigates to Context Tool for this Loss's Environment)
* Launch Attack Tool (navigates to Attack Tool for entities in this tree)
* Launch Trace Tool (navigates to Trace Tool for this Loss's Asset)
* Launch Goal Keeper Tool (navigates to Goal Keeper Tool for this Loss's Root Goal)
* Close

\---

**Canvas — Attack Tree Diagram**

The canvas is the largest region, occupying the center of the window. It renders
the Attack Tree as a vertically organized DAG.

Layout conventions:

* (:Loss) root node (T0) at top center.
* Tier bands descend vertically at fixed intervals (default 120px per tier at
100% zoom; adjustable by User zoom).
* Tier labels displayed in the left margin: T0, T1, T2, T3, T4, T5, T6+.
* Nodes are distributed horizontally within each tier.
* Edges are directed downward from parent to child.

Canvas controls:

* Zoom: mouse wheel or +/- controls; "Fit to Canvas" button.
* Pan: drag on background.
* Node selection: single click.
* Edge selection: single click on edge line.
* Node drag: reposition horizontally within tier (stages layout change).
* Right-click node or edge: context menu.
* Escape: deselect / close context menu.

The canvas SHALL maintain consistent, non-overlapping node layout and SHALL
provide a minimap in the lower-right corner for large trees.

**Validation Findings Panel** (collapsible, appears above canvas when findings exist):

When AttackTreeJSON.validationFindings is non-empty, a collapsible panel appears
between the top bar and the canvas. It SHALL display:

* A summary line: "N errors, M warnings, P info — tree may be stale."
* One row per finding: severity icon (ERROR/WARNING/INFO color), finding type
label, affected node HID (clickable — clicking highlights node in canvas),
brief description, action button ("Rebuild Tree" for errors, "Acknowledge"
for warnings, "Dismiss" for info).
* A "Rebuild Tree" button applies to all ERROR findings.
* A "Dismiss All INFO" button collapses INFO-only findings.
* A "Collapse" toggle hides the panel body; summary line remains.

\---

**Left Panel — Attack Path List (Attack Path Analysis Mode only)**

The left panel is hidden in Trace Coverage Mode and Attack Tree Construction
Mode. It activates in Attack Path Analysis Mode.

It displays an ordered list of all enumerated attack paths. Each row shows:

* Path number (ordinal).
* Path summary label: abbreviated node sequence "Loss → State → Entity → Attack →
[Countermeasure] → ... → leaf".
* One metric value column per defined metric (numeric, colored pass/fail).
* RV status badge: "RV" (red, unaddressed) / "RV✓" (amber, allowed) / blank.
* "Highlight" icon button: highlights the path on canvas.

Controls above the list:

* Sort by: any metric column (click column header); ascending/descending toggle.
* Filter: All / RV only / Allowed RV only / Blocked paths.
* "Export Selected" button: exports highlighted path(s) as RV records.
* Page controls for path counts over 500 (page size = 100).

\---

**Right Panel — Node and Edge Detail Panel**

The right panel is always visible and updates when a node or edge is selected.

**When no selection:** displays Loss summary — Loss Name, Asset Name, Environment,
Criticality, Assurance, PathCount, TreeHasRVs, metric summary.

**On node selection:**

* Node type badge, HID (copyable), Name, ShortDescription.
* Criticality/Assurance badges inherited from Asset (for entity nodes).
* AttackLevel (for Attack nodes).
* ReferenceFramework and ReferenceID (for Attack nodes cloned from Reference Data).
* MetricsJSON values: leaf Attack nodes show editable metric fields; branch nodes
show computed MetricCacheJSON from incoming edges (read-only).
* Relationship summary: incoming parent(s), outgoing children (count).
* **Editable properties** (staged on change; Commit persists):

  * TailoredOut (checkbox) + TailorReason (text, required when True).
  * CompleteBlock (checkbox, on Countermeasure nodes only) + CompleteBlockReason.
  * AllowedRV (checkbox, on leaf Attack nodes only) + AllowedRVReason.
  * MetricsJSON key-value pairs (leaf Attack nodes only).
* Action buttons appropriate to node type (see Section 6.5.10.5b.1).

**On edge selection:**

* Source node HID → Target node HID.
* LogicOperator (editable: AND / OR / SAND selector).
* SANDSequence (integer, editable when LogicOperator = SAND).
* TailoredOut (checkbox) + TailorReason.
* MetricCacheJSON: computed metric values at this edge (read-only).
* CompleteBlock (if target is Countermeasure and edge is terminal).
* AllowedRV (if target is Attack leaf and edge is terminal).

\---

**Bottom Bar — Metric Summary**

Hidden when no metrics are defined. Visible when MetricDefinitionsJSON is non-null.

For each defined metric, the bottom bar displays one panel:

* MetricName.
* Root computed value (formatted to 4 significant figures).
* AcceptanceThreshold.
* Pass/Fail indicator (colored chevron): green checkmark (pass), red X (fail).
* A mini progress bar normalized to the threshold (for MINIMIZE metrics: bar
fills left-to-right toward threshold; for MAXIMIZE metrics: bar fills toward
full from zero).

Clicking a metric panel in the bottom bar toggles metric badge display on all
canvas nodes for that specific metric.

\---

### 6.5.10.3 Invocation

The Loss Tool SHALL be launched from the SSTPA Control Panel.

**Context-aware open behavior:**

|Data Drawer Context|Loss Tool Opens With|
|-|-|
|(:Loss) node|That Loss loaded directly|
|(:Asset) node|Loss Selector filtered to [:HAS_LOSS] of that Asset|
|(:Attack) node|Loss Selector filtered to Loss trees referencing that Attack via LossHID on [:AT_RELATES_TO]|
|(:Countermeasure) node|Loss Selector filtered to Loss trees referencing that Countermeasure|
|(:State), (:Component), (:Interface), (:SystemFunction)|Loss Selector filtered to Loss trees referencing that node|
|(:Environment)|Loss Selector filtered to [:HAS_ENVIRONMENT] of that Environment|
|(:System) or no context|Full Loss Selector for active SoI|

**Loss Selector:**

The Loss Selector SHALL be a modal table showing all (:Loss) nodes in the
scope (filtered per above or full SoI). Columns:

* Loss HID
* Name
* Asset Name
* Environment Name (or "Unassigned" with amber indicator)
* Criticality (single active value)
* Assurance (single active value)
* AttackTreeStatus badge
* TreeIsValid indicator
* PathCount ("--" if not built)

The User selects a row to open that Loss. A "Cancel" button closes the selector
without opening the Loss Tool.

**Mode determination on open (after Loss is selected):**

The Loss Tool SHALL execute the following decision sequence:

**Step 1 — Trace Coverage check:**
Query CURRENT [:HOLDS], [:TRANSPORTS], [:USES] from entities to the Loss's Asset.

* If zero CURRENT relationships exist across all States in the Loss's Environment:
→ Open in Trace Coverage Mode. Display "No Trace Data" warning banner.
Display "Launch Trace Tool" button. Do NOT attempt to build a tree.
* If some States have CURRENT coverage and others have none:
→ Open in Trace Coverage Mode. Display "Partial Coverage" warning. Display
count "M of N States covered". Allow User to proceed or launch Trace Tool.
* If all States with [:VALID_IN] to the Loss's Environment have at least one
CURRENT entity relationship: → Proceed to Step 2.

**Step 2 — Attack population check:**
Query [:EXPLOITS] relationships for entities with CURRENT Trace coverage.

* If no Attacks are associated to any traced entity:
→ Display a non-blocking WARNING overlay: "No Attack nodes found for traced
entities. The auto-built tree will have no Tier 3 content. Consider using the
Attack Tool first." User may: [Continue Anyway] [Launch Attack Tool] [Cancel].
* If at least one Attack association exists: → Proceed to Step 3.

**Step 3 — Tree state check:**

* If AttackTreeJSON is Null (AttackTreeStatus = NOT_BUILT):
→ Auto-build the tree (Section 6.5.10.7) and open in Attack Tree Construction
Mode. Display "Tree Auto-Built" notification.
* If AttackTreeStatus = INVALIDATED:
→ Reconcile graph against snapshot (Section 6.5.10.12).
→ Open in Attack Tree Construction Mode with Validation Findings panel expanded
showing all ERROR findings.
* If AttackTreeStatus is any other value:
→ Reconcile graph against snapshot (Section 6.5.10.12).
→ Open in Attack Tree Construction Mode. If findings exist, show Validation
Findings panel (collapsed for WARNING/INFO only; expanded for ERROR).

Launching the Loss Tool SHALL NOT change the current SoI.
Launching the Loss Tool SHALL NOT disrupt staged edits in the main GUI Data Drawer.

\---

### 6.5.10.4 Supported Node Context

The Loss Tool SHALL support invocation when the Data Drawer is open for any of
the following node types:

* (:Loss)
* (:Asset)
* (:Attack)
* (:Countermeasure)
* (:State)
* (:Environment)
* (:Interface)
* (:SystemFunction)
* (:Component)
* (:System)

On open the Loss Tool SHALL load the following data from the Backend:

* The selected (:Loss) node with all properties including AttackTreeJSON and
MetricDefinitionsJSON.
* The associated (:Asset) node (via [:HAS_LOSS] inverse) with Criticality and
Assurance properties.
* The associated (:Environment) node (via [:HAS_ENVIRONMENT]).
* All (:State) nodes with [:VALID_IN] to the Loss's Environment, with their
StateSequence values, ordered by StateSequence ascending.
* All CURRENT [:HOLDS], [:TRANSPORTS], [:USES] relationships from any entity in
the SoI to the Loss's Asset, with TraceStateHID values.
* All [:AT_RELATES_TO] relationships with LossHID matching this Loss's HID,
with all relationship properties.
* All (:Attack), (:Countermeasure), (:State), (:Interface), (:SystemFunction),
(:Component), and (:Asset) nodes referenced in the above [:AT_RELATES_TO] edges.
* All (:Countermeasure) nodes in the active SoI (for the association picker
during Countermeasure addition).
* All (:Attack) nodes in the active SoI associated to any entity via [:EXPLOITS]
(for the Attack association picker).
* The validationSnapshot and validationFindings from AttackTreeJSON.

\---

### 6.5.10.5 Modes of Operation

\---

#### 6.5.10.5a Trace Coverage Mode

Trace Coverage Mode is a read-only prerequisite view that displays the Trace
Tool's output for the Loss's Asset. It shows which entities have been traced to
the Asset in which States, before the analyst proceeds to tree construction.

**Layout:**

The mode displays a matrix in the right panel (canvas is hidden):

* Columns: (:State) nodes with [:VALID_IN] to the Loss's (:Environment), ordered
by StateSequence ascending. Each column header shows: State HID, Name,
StateSequence badge.
* Rows: all (:Interface), (:SystemFunction), and (:Component) nodes in the active SoI,
grouped by type (Interfaces, then Functions, then Elements). Each row header
shows: node type badge, HID, Name.
* Each cell: shows the Trace relationship type and TraceStatus for this
entity-State-Asset combination.

**Cell display states:**

|Display|Meaning|
|-|-|
|HOLDS (blue)|CURRENT [:HOLDS] relationship exists|
|TRANSPORTS (teal)|CURRENT [:TRANSPORTS] relationship exists|
|USES (green)|CURRENT [:USES] relationship exists|
|SUPERSEDED (yellow, strikethrough)|TraceStatus = SUPERSEDED|
|INVALIDATED (red, "!")|TraceStatus = INVALIDATED|
|Empty (grey background)|No relationship for this combination|

**Coverage Summary bar** (above matrix):

* "States covered: M of N" where N is the count of States with [:VALID_IN] to
the Environment, M is the count of those with at least one CURRENT entity
relationship for the Asset.
* "Entities traced: P entities across Q combinations."

**Controls:**

* "Proceed to Tree Construction" button: enabled when at least one State has at
least one CURRENT entity relationship. Transitions to Attack Tree Construction
Mode (Section 6.5.10.5b). If AttackTreeJSON is Null, auto-build runs first.
* "Launch Trace Tool" button: opens Trace Tool for the Loss's Asset.
* Filter: "Show all entities" / "Show traced entities only" / "Show untraced only".
* Sort rows: by entity type (default) / by HID / by trace count (descending).

No data may be edited or created in Trace Coverage Mode.

\---

#### 6.5.10.5b Attack Tree Construction Mode

Attack Tree Construction Mode is the primary analytical working mode. The canvas
displays the full Attack Tree DAG for the selected Loss.

**Canvas interaction:**

* **Click node:** loads node in Node Detail Panel; highlights node.
* **Click edge:** loads edge in Node Detail Panel; highlights edge and its two
endpoint nodes.
* **Drag node horizontally within tier:** stages a layout change (repositions
node within its tier band). Does not change semantic graph; updates
AttackTreeJSON layout section on Commit.
* **Click logical operator label on edge:** cycles the LogicOperator:
AND → OR → SAND → AND. Stages the change. For SAND: SANDSequence fields
appear on all sibling edges from the same parent; drag sibling edges vertically
within the tier to reorder SAND sequence.
* **Escape:** deselects current node/edge; closes context menu if open.
* **Mouse wheel / pinch:** zoom.
* **Drag canvas background:** pan.

**Context menu on node right-click (Section 6.5.10.5b.1):**

The context menu content is conditional on the node type at the right-click target.

*On (:Loss) root node (T0):*

* View Properties (opens Data Drawer for this Loss).
* Define Metrics (opens Metric Editor).
* Rebuild Tree.
* Launch Context Tool.

*On (:Environment) node (T1):*

* View Properties (opens Data Drawer for this Environment).
* Launch Context Tool.

*On (:State) node (T1):*

* View Properties (opens Data Drawer for this State).
* Set SAND Operator (changes incoming edge to SAND; enables sequence editing).
* Set OR Operator (changes incoming edge to OR).
* Launch Context Tool (opens Context Tool with this State highlighted).
* Launch State Tool.

*On (:Interface), (:SystemFunction), (:Component) node (T2):*

* Add Existing Attack: opens an Attack selector showing Attacks associated to
this entity via [:EXPLOITS] that are not already in this tree at this position.
Creates [:AT_RELATES_TO] edge with LogicOperator = OR.
* Add New Attack Inline: opens Attack creation form (Name, AttackLevel, optional
ShortDescription). Creates the Attack, [:EXPLOITS] relationship, and
[:AT_RELATES_TO] edge. Prompts: "Also add canonical [:EXPLOITS] relationship?"
* Clone Attack from Reference: launches Reference Tool in Assignment Mode filtered
to ATT\&CK Technique/Sub-Technique, ATLAS Technique, EMB3D Vulnerability.
On return: creates Attack via clone-and-own, [:EXPLOITS], and [:AT_RELATES_TO].
* Tailor Out: sets TailoredOut = True on incoming edge; prompts for TailorReason.
* Launch Attack Tool for this Entity: opens Attack Tool with this entity selected.
* View Properties: opens Data Drawer for this entity.

*On (:Attack) node (T3/T5/T7+):*

* Add Existing Countermeasure: opens Countermeasure selector from the active SoI.
Creates [:AT_RELATES_TO] edge with LogicOperator = AND. Prompts: "Also add
canonical [:BLOCKS] relationship?"
* Add New Countermeasure Inline: opens Countermeasure creation form. Creates
Countermeasure, [:BLOCKS], and [:AT_RELATES_TO] edge.
* Expand Sub-Attacks: inlines [:SUBORDINATE_TO] procedure-level children as new
T+1 Attack nodes (push Countermeasures one tier deeper).
* Tailor Out: sets TailoredOut = True on incoming edge; prompts for TailorReason.
* Mark as Allowed RV: visible only on leaf Attack nodes (no Countermeasure
children). Prompts for AllowedRVReason (required). Sets AllowedRV = True.
* Set Metric Values: opens inline MetricsJSON editor in Node Detail Panel.
* Add Derived Asset: visible only when this Attack node is at T3+. Opens Derived
Asset creation form (see Section 6.5.10.10).
* View Properties: opens Data Drawer for this Attack node.

*On (:Countermeasure) node (T4/T6+):*

* Set Complete Block: sets CompleteBlock = True; prompts for CompleteBlockReason.
* Remove Complete Block: sets CompleteBlock = False.
* Add Counter-Attack (existing): opens Attack selector for Attacks that DEFEAT
this Countermeasure via [:DEFEATS].
* Add Counter-Attack (new): creates new Attack, [:DEFEATS], and [:AT_RELATES_TO].
* Add Derived Asset: opens Derived Asset creation form.
* Tailor Out: sets TailoredOut = True on incoming edge; prompts for TailorReason.
* View Properties: opens Data Drawer for this Countermeasure.

*On (:Asset) Derived terminal node:*

* Navigate to Derived Asset Tree: opens Loss Tool Loss Selector for the Derived
Asset's (:Loss) nodes.
* View Properties: opens Data Drawer for this Derived Asset.

**Staged changes:**

All tree modifications (new edges, changed properties, changed operators, layout
moves) are staged. The canvas visually distinguishes staged from committed state
(see Section 6.5.10.18). The Revert button discards all staged changes. The
Commit button (active only with staged changes) persists all staged changes,
runs validation, triggers metric recalculation, updates AttackTreeJSON, and
updates AttackTreeStatus from AUTO_GENERATED to ANALYST_REFINED (if it was
AUTO_GENERATED) or leaves it at ANALYST_REFINED.

\---

#### 6.5.10.5c Attack Path Analysis Mode

Attack Path Analysis Mode activates the left-panel Attack Path List and enables
path-level review and RV management.

**Entering the mode:**

The mode is entered by clicking the "Attack Path Analysis" tab in the mode
selector. It is available only when PathCount is not Null. If the tree has no
computed paths, the mode selector shows a disabled "Attack Path Analysis" tab
with tooltip "Build or commit the tree first."

**Path enumeration:**

A path is a unique sequence of nodes from the (:Loss) root to a terminal leaf
node following [:AT_RELATES_TO] edges where:

* TailoredOut = False on every edge in the path.
* The path does not visit any node more than once (DAG constraint).

Terminal leaf nodes are:

* An (:Attack) node with no outgoing [:AT_RELATES_TO] edge (Residual Vulnerability,
allowed or unaddressed).
* A (:Countermeasure) node with CompleteBlock = True (path is blocked).
* A Derived (:Asset) terminal node (path terminates in a new Loss scope).

**Path display:**

Each path row in the Attack Path List shows:

* Path number (integer, 1-indexed).
* Path label: abbreviated node name sequence from T0 to leaf, separated by " → ".
Label truncated at 80 characters; full sequence in tooltip and in detail view.
* Metric value columns: one column per defined metric. Value is the computed
metric value for this complete path. Colored: green (path passes threshold),
red (path fails threshold), grey (no threshold defined for this metric).
* RV status badge:

  * "RV" red: leaf is an unaddressed Residual Vulnerability.
  * "RV✓" amber: leaf is an Allowed Residual Vulnerability.
  * "BLOCKED" grey: leaf is a CompleteBlock Countermeasure.
  * "DERIVED" blue: leaf is a Derived Asset terminal.

**Path detail view:**

Clicking a path row (or the row's expand chevron) expands it to show the full
path node sequence in a vertical list: each node's type badge, HID, Name, and
metric value at that node. Clicking any HID in the expanded view highlights that
node on the canvas.

**Single-path highlight:**

Clicking the "Highlight" icon on a path row:

* The canvas highlights the selected path: all nodes and edges on the path render
at 100% opacity with their standard colors.
* All other nodes and edges render at 20% opacity (muted).
* The canvas scrolls to bring the root-to-leaf path into view.
* The "Clear Highlight" button in the canvas toolbar or pressing Escape restores
full-tree display.

**RV acknowledgment from path list:**

Right-clicking an unaddressed RV path row shows "Mark as Allowed RV". The tool
prompts for AllowedRVReason (required). On confirmation, the AllowedRV flag is
staged on the leaf Attack's incoming edge. Commit persists the change and
recalculates TreeHasRVs.

**Sorting:**

Default sort: ascending by first defined metric (lowest-cost / lowest-probability
paths appear first — the highest-priority paths for countermeasure investment).

Clicking any metric column header sorts by that metric. Second click reverses.
Clicking the RV badge column sorts: unaddressed RVs first, then Allowed RVs,
then blocked paths, then Derived Asset paths.

\---

### 6.5.10.6 Attack Tree Tier Structure

The Attack Tree is a Directed Acyclic Graph (DAG) rooted at the (:Loss) node
and organized into analytical tiers. Tiers are labeling conventions for reading
clarity; the underlying representation is a general DAG and nodes may appear
at varying logical depths across different branches.

The following tier conventions define how nodes appear in the Structured Attack
Tree diagram and how the auto-build populates them.

\---

**T0 — Root (:Loss) Node**

Single (:Loss) node at the apex. Displays: Loss Name, Asset Name, Criticality
label, Assurance label, Environment Name.

The (:Loss) node is the source of all outgoing [:AT_RELATES_TO] edges. It is
never a target node.

**Population:** created automatically; always present for any Loss with a
[:HAS_ENVIRONMENT] relationship.

\---

**T1 — Environment and States**

Two sub-groups appear at T1, connected from the (:Loss) root:

*Environment node* — the (:Environment) associated with this Loss via
[:HAS_ENVIRONMENT]. Connected from (:Loss) with LogicOperator = AND (the attack
must occur in this environment — this is an unconditional precondition).

*State nodes* — (:State) nodes with [:VALID_IN] to the Loss's (:Environment) AND
at least one CURRENT Trace entity relationship for the Loss's (:Asset) where
TraceStateHID matches the State. Connected from (:Loss) with LogicOperator = OR
(any State is an independent attack opportunity) or SAND (States must be
traversed in sequence). Default is OR.

StateSequence on the (:State) nodes is used to pre-populate SANDSequence on
[:AT_RELATES_TO] edges when the User changes the operator to SAND.

A (:State) that has [:VALID_IN] to the Environment but no CURRENT Trace entity
relationships for the Asset is excluded from the auto-build. The User may manually
add it by right-clicking the canvas background and selecting "Add State."

\---

**T2 — Entities (Interface, Function, Element)**

Each (:State) node at T1 is connected downward to the entity nodes that have
a CURRENT [:HOLDS], [:TRANSPORTS], or [:USES] relationship to the Loss's (:Asset)
with TraceStateHID matching that State's HID.

The same underlying entity node MAY appear under multiple T1 State nodes. Each
appearance is a distinct tree node (distinct T2 position and incoming edge from
a different T1 parent) but references the same Core Data node (same uuid).

Default LogicOperator between sibling entities under the same State parent: OR
(each entity is an independent attack surface in that State). User MAY change to
AND (the attack requires access to multiple entities simultaneously).

\---

**T3 — Attacks**

Each T2 entity node is connected downward to (:Attack) nodes via [:AT_RELATES_TO],
drawn from the entity's [:EXPLOITS] associations. An (:Attack) with AttackLevel =
STRATEGY or TACTIC may be a branch node with subordinate PROCEDURE-level children
(expandable via context menu). An (:Attack) with no Countermeasure children is a
leaf node and constitutes a Residual Vulnerability path endpoint.

A TailoredOut = True edge excludes the Attack from path enumeration but retains
it in the display (muted, dashed edge) so the analyst can see the tailoring
decision and its documented reason.

Default LogicOperator between sibling Attacks under the same entity parent: OR
(any one attack technique succeeds independently). User MAY change to AND (all
techniques must succeed together — e.g. a combined attack requiring both social
engineering and a technical exploit).

\---

**T4 — Countermeasures**

Each T3 Attack node is connected downward to (:Countermeasure) nodes that BLOCK
it, drawn from (:Countermeasure)-[:BLOCKS]->(:Attack) relationships.

A (:Countermeasure) with CompleteBlock = True is a terminal leaf of its branch —
the attack is completely prevented by this countermeasure with no recourse.
CompleteBlock = True requires a documented CompleteBlockReason.

A (:Countermeasure) with CompleteBlock = False is a branch node that expects
T5 counter-attacks representing how the countermeasure could itself be defeated.

Default LogicOperator between sibling Countermeasures under the same Attack parent:
AND (the attacker must defeat ALL countermeasures to proceed on that path).

\---

**T5 — Counter-Attacks**

Each non-terminal T4 Countermeasure node is connected downward to (:Attack) nodes
representing attacks that defeat the countermeasure, drawn from
(:Attack)-[:DEFEATS]->(:Countermeasure) relationships or added by the User inline.

T5 Attack nodes follow the same leaf/branch rules as T3: a T5 Attack with no
Countermeasure children is an RV leaf. A T5 Attack with Countermeasure children
at T6 continues the pattern.

\---

**T6+ — Further Rounds**

The T4/T5 Countermeasure/Counter-Attack pattern repeats at T6, T7, and deeper as
needed. In practice, trees rarely exceed T6 before all branches terminate as RVs,
Allowed RVs, CompleteBlock Countermeasures, or Derived Asset leaves.

The Backend SHALL enforce a maximum tree depth (default: 12 tiers) to prevent
unbounded recursive auto-build. The User may extend this limit explicitly.

\---

**Derived Asset Terminal Nodes**

A Derived (:Asset) node may appear at T3 or deeper as a terminal leaf of its
branch. It represents an Asset whose compromise is a prerequisite for compromising
the primary Asset of this Loss. The Derived Asset node:

* Displays a diamond shape with a spawn indicator (outbound arrow).
* Terminates the current tree branch.
* Spawns a new Loss analysis scope for the Derived Asset.

Derived Asset creation is specified in Section 6.5.10.10.

\---

### 6.5.10.7 Auto-Build Logic

The Loss Tool SHALL auto-build the Attack Tree from Backend graph data when:

* AttackTreeJSON is Null (first time the Loss is opened in the Loss Tool).
* The User explicitly triggers "Rebuild Tree" from the toolbar or Validation
Findings panel.
* On open, reconciliation detects ERROR-severity findings in validationFindings
(the graph has diverged too significantly from the snapshot for the existing
layout to be trusted).

**Auto-build query sequence:**

The Backend SHALL execute a single bounded-depth traversal and return the
complete tree data structure in one API response:

1. Load the (:Loss) node and its (:Asset) (via inverse [:HAS_LOSS]) and
(:Environment) (via [:HAS_ENVIRONMENT]).
2. Load all (:State) nodes with [:VALID_IN] to the Environment, ordered by
StateSequence ascending. Record State HIDs for query scoping.
3. For each State: load entities with CURRENT [:HOLDS], [:TRANSPORTS], or [:USES]
to the Asset where TraceStateHID = that State's HID. Group results by State.
4. For each entity: load all (:Attack) nodes via [:EXPLOITS], with their complete
[:SUBORDINATE_TO] descendant hierarchy (bounded depth 3).
5. For each Attack: load all (:Countermeasure) nodes via
(:Countermeasure)-[:BLOCKS]->(Attack).
6. For each Countermeasure: load all (:Attack) nodes via
(:Attack)-[:DEFEATS]->(Countermeasure). Recurse up to max depth.

**Default LogicOperator assignment:**

|Relationship|Default LogicOperator|
|-|-|
|(:Loss)-[:AT_RELATES_TO]->(Environment)|AND|
|(:Loss)-[:AT_RELATES_TO]->(State)|OR|
|(State)-[:AT_RELATES_TO]->(Entity)|OR|
|(Entity)-[:AT_RELATES_TO]->(Attack)|OR|
|(Attack)-[:AT_RELATES_TO]->(Countermeasure)|AND|
|(Countermeasure)-[:AT_RELATES_TO]->(Counter-Attack)|OR|

All edges carry: LossHID = this Loss's HID, Lossuuid = this Loss's uuid,
TailoredOut = False, SANDSequence = Null (all OR by default).

When the SAND operator is later set on State siblings, SANDSequence values are
assigned from the StateSequence values of the States (lower StateSequence →
lower SANDSequence). States without StateSequence are appended at the end.

**Layout generation:**

After edge construction, the tool generates a default spatial layout:

* Each tier occupies a fixed vertical band.
* Nodes within a tier are distributed horizontally with equal spacing.
* The (:Loss) root is centered at (0, 0). All other nodes are positioned relative
to root.
* The generated layout is written to the `layout` section of AttackTreeJSON.

**Post-build computation (Backend, same transaction):**

1. TreeIsValid: True if at least one complete root-to-leaf path exists and no
cycles are present.
2. PathCount: count of root-to-leaf paths with TailoredOut = False edges.
3. TreeHasRVs: True if any leaf (:Attack) node exists with TailoredOut = False
incoming edge and AllowedRV = False.
4. MetricCacheJSON on all edges: computed using LeafDefault for leaf Attacks
without MetricsJSON (requires MetricDefinitionsJSON to be non-null; if Null,
MetricCacheJSON is Null).
5. AttackTreeStatus = AUTO_GENERATED.
6. AttackTreeCreated = now (if first build); AttackTreeLastModified = now (always).
7. AttackTreeVersion incremented by 1.
8. validationSnapshot written (see Section 6.5.10.12).
9. validationFindings initialized to empty array (clean build = no findings).

**Transaction scope:**

The entire auto-build (all [:AT_RELATES_TO] edge creation, all property updates,
AttackTreeJSON write) SHALL be committed as a single ACID transaction. On any
Backend failure, the transaction rolls back completely and the (:Loss) remains
in its prior state (AttackTreeStatus = NOT_BUILT if first build).

\---

### 6.5.10.8 Metric System

The Loss Tool supports a configurable parametric metric system applied to the
Attack Tree. Metrics allow the analyst to quantify attack difficulty, probability,
and other properties of attack paths, and to assess paths against acceptance
thresholds used in certification.

**Metric Editor:**

The "Define Metrics" toolbar button opens the Metric Editor as a modal overlay.
The editor displays the current MetricDefinitionsJSON as a table of metric rows.

Each metric definition row has the following editable fields:

|Field|Type|Required|Notes|
|-|-|-|-|
|MetricName|String|Yes|Display name; must be unique within this Loss|
|MetricDirection|MINIMIZE|MAXIMIZE|Yes|
|LeafDefault|Number|Yes|Value used for leaf Attack nodes with no MetricsJSON entry for this metric|
|ANDFormula|SUM|PRODUCT|MIN|
|ORFormula|SUM|PRODUCT|MIN|
|SANDFormula|SUM|PRODUCT|MIN|
|AcceptanceThreshold|Number|No|If set, root value compared against it|
|ThresholdDirection|ABOVE|BELOW|Required if threshold set|
|Description|String|No|Analyst note on this metric's meaning|

The Metric Editor provides "Add Metric", "Duplicate", and "Delete" row controls.
Saving the editor stages MetricDefinitionsJSON. Commit persists and triggers
full metric recalculation.

**Metric propagation (bottom-up):**

Metric propagation is executed by the Backend on every Commit that changes the
tree structure or MetricDefinitionsJSON. For each defined metric:

1. For each leaf (:Attack) node in the tree (TailoredOut = False on incoming edge):

   * Value = MetricsJSON[MetricName] if present, else LeafDefault.
   * Value for a CompleteBlock Countermeasure leaf = 0 (blocked path contributes
zero to cost metrics and 1.0 to blocking metrics — depending on MetricDirection
the analyst should configure appropriately).
2. For each Countermeasure with MetricsJSON[MetricName]:

   * Add (for SUM formula paths) or multiply (for PRODUCT) the Countermeasure's
metric contribution to the path value passing through it. A Countermeasure
that raises attack cost adds its value to the path cost. The specific
interaction is defined by the formula for the parent's incoming operator type.
3. For each branch node: compute value from children per the formula matching
the LogicOperator on the incoming edge from the parent:

   * AND: apply ANDFormula across all non-TailoredOut children.
   * OR: apply ORFormula across all non-TailoredOut children.
   * SAND: apply SANDFormula across all non-TailoredOut children in SANDSequence
order.
4. The computed value at each edge is stored in MetricCacheJSON on the
[:AT_RELATES_TO] edge property.
5. The root (:Loss) node's incoming metric values represent the aggregated metric
for the entire tree.

**Standard configurations:**

*Attack Cost (minimum cost for the attacker to succeed):*

* ANDFormula = SUM (must defeat all siblings; costs add).
* ORFormula = MIN (attacker picks cheapest alternative).
* SANDFormula = SUM (sequential steps; costs accumulate).
* Direction = MINIMIZE (lower cost = more achievable path = higher risk).
* ThresholdDirection = ABOVE (minimum attack cost must exceed budget threshold to pass).

*Attack Probability (probability that an attack path succeeds):*

* ANDFormula = PRODUCT (all steps must succeed; probabilities multiply).
* ORFormula = MAX (any one path succeeds; attacker picks highest-probability path).
* SANDFormula = PRODUCT (sequential steps; probabilities multiply).
* Direction = MINIMIZE (lower probability = safer).
* ThresholdDirection = BELOW (maximum path probability must be below acceptable
risk threshold, e.g. 1×10⁻⁵ for five-nines safety assurance).

\---

### 6.5.10.9 Residual Vulnerability Management

A **Residual Vulnerability (RV)** is an attack path that terminates in a leaf
(:Attack) node that:

* Has no outgoing [:AT_RELATES_TO] edge to a (:Countermeasure), AND
* Has TailoredOut = False on its incoming edge.

An **Unaddressed RV** is an RV where AllowedRV = False on the terminal edge.

An **Allowed RV** is an RV where AllowedRV = True and AllowedRVReason is non-null
on the terminal edge. An Allowed RV has been explicitly reviewed and accepted by
the analyst, with documented justification.

TreeHasRVs = True when any Unaddressed RVs exist in the tree.

**RV identification:**

The Backend identifies RV paths on every Commit via the RV detection query
(leaf Attack nodes with no Countermeasure children and TailoredOut = False).
Results update TreeHasRVs. The list of RV paths is available to the Frontend
via the path enumeration query filtered to RV-terminating paths.

**RV display in canvas:**

* Unaddressed RV leaf Attack nodes: red border, red "RV" badge.
* Allowed RV leaf Attack nodes: amber border, amber "RV✓" badge.
* The entire path from root to an Unaddressed RV is highlighted in red in Attack
Path Analysis Mode when that path is selected.

**Acknowledging an Allowed RV:**

1. In Attack Tree Construction Mode: right-click the RV leaf Attack → "Mark as
Allowed RV." Prompts for AllowedRVReason (required; minimum 20 characters).
Stages AllowedRV = True and AllowedRVReason on the incoming edge.
2. In Attack Path Analysis Mode: right-click an RV path row → "Mark as Allowed
RV." Same prompt.
3. From Node Detail Panel: check AllowedRV checkbox; enter AllowedRVReason.

On Commit: AllowedRV and AllowedRVReason are persisted on the [:AT_RELATES_TO]
edge. TreeHasRVs is recalculated. AttackTreeStatus advances from AUTO_GENERATED
to ANALYST_REFINED (if not already).

**Revoking an Allowed RV:**

The User may un-check AllowedRV from the Node Detail Panel. AllowedRV reverts
to False. AllowedRVReason is cleared. On Commit, the path becomes an Unaddressed
RV again.

**RV Record:**

Each RV path (addressed or not) generates an RV Record used in the
Residual Vulnerability Report (Section 6.5.10.14). The RV Record contains:

* Path identifier: sequential integer.
* Path node sequence: ordered list of { nodeType, HID, Name } from T0 to leaf.
* Complete leaf Attack: HID, Name, AttackLevel, ReferenceFramework, ReferenceID,
IsRVCandidate.
* Metric values: one entry per defined metric { MetricName, value, threshold,
passFail }.
* RV status: Unaddressed or Allowed.
* AllowedRVReason (if Allowed).
* Tree Commit timestamp (LastTreeBuild).
* AttackTreeVersion at time of record generation.

The RV Record is the primary evidence artifact submitted to certification
authorities for residual risk acceptance.

\---

### 6.5.10.10 Derived Asset Handling

A Derived Asset terminates a branch of the current Attack Tree and spawns a new
Loss analysis. It models the case where defeating a Countermeasure requires
first compromising a prerequisite Asset — e.g. obtaining the encryption key that
the Countermeasure relies on.

**Placement:**

A Derived Asset may be placed at T3 or deeper. It is always connected from a
(:Countermeasure) node (T4+) via [:AT_RELATES_TO] with LogicOperator = AND.

The User accesses "Add Derived Asset" from the right-click context menu on any
Countermeasure node.

**Creation form:**

The Derived Asset creation form collects:

* Asset Name (required).
* Criticality (required; defaults to same Criticality as the primary Loss Asset).
* Assurance (required; the analyst must consciously select — may differ from
the primary Asset's Assurance; see example below).
* ShortDescription (optional).

*Assurance mismatch example:* A primary Asset requiring Authenticity assurance
is protected by a digital signature using a private asymmetric key. The private
key is a Derived Asset requiring Confidentiality assurance (not Authenticity).
The analyst selects Confidentiality for the Derived Asset.

**On Commit the Backend SHALL execute as a single ACID transaction:**

1. Create (:Asset) node: IsPrimary = False, all required common properties.
2. Create (:primary Asset)-[:DERIVES]->(:Derived Asset).
3. For each true (Criticality, Assurance) pair on the Derived Asset: create a
(:Loss) node per Asset Manager Tool Section 6.5.7.9 rules (without Environment;
pending Context Tool allocation).
4. Create (:Derived Asset)-[:HAS_LOSS]->(each new Loss).
5. For each new Loss: create a Root (:GsnGoal) node and (:Derived Asset)-[:HAS_GOAL].
6. Create [:AT_RELATES_TO] edge from the parent Countermeasure to the Derived Asset
node in the current tree (LogicOperator = AND, LossHID = current Loss HID).
7. Update AttackTreeJSON to include the Derived Asset in the layout.

**Post-creation:**

* The Derived Asset node appears in the canvas at the appropriate tier with a
diamond shape and spawn indicator.
* The Node Detail Panel for the Derived Asset shows the new Asset HID, Name,
Criticality, Assurance, and the HID(s) of its spawned Loss node(s).
* TreeIsValid, PathCount, and TreeHasRVs are recomputed.

**Navigation:**

Clicking the spawn indicator on a Derived Asset node opens the Loss Tool Loss
Selector filtered to the Derived Asset's (:Loss) nodes. If only one Loss node
exists for the Derived Asset, it opens directly.

**Notification:**

After a successful Derived Asset creation Commit, the Loss Tool SHALL display:
"Derived Asset '{Name}' created. {N} new Loss node(s) generated. Use the Context
Tool to assign Environments to the new Loss nodes before building their trees."

\---

### 6.5.10.11 Core Data Relationship Synchronization

The [:AT_RELATES_TO] graph relationships are the semantic source of truth for
the Attack Tree. The AttackTreeJSON is presentation state only. The Loss Tool
SHALL maintain consistency between the tree representation and the canonical
Core Data relationships.

**Adding an Attack to an entity via the tree:**

The Loss Tool creates the [:AT_RELATES_TO] edge with LossHID. If no [:EXPLOITS]
relationship exists between the Attack and the entity, the tool SHALL prompt:

> "Add canonical [:EXPLOITS] relationship from '{Attack Name}' to '{Entity Name}'?
> This will make the association visible across all SoI tools, not only in this tree.
> [Yes — Add EXPLOITS] [No — Tree Only]"

If "Yes": [:EXPLOITS] is created in the same Commit transaction.
If "No": the [:AT_RELATES_TO] edge is created but no [:EXPLOITS] relationship
exists; the Attack appears in this tree but is not accessible via the Attack Tool
entity roster for this entity.

**Adding a Countermeasure to an Attack via the tree:**

The Loss Tool creates the [:AT_RELATES_TO] edge with LossHID. If no [:BLOCKS]
relationship exists, the tool SHALL prompt:

> "Add canonical [:BLOCKS] relationship from '{Countermeasure Name}' to
> '{Attack Name}'? [Yes — Add BLOCKS] [No — Tree Only]"

**Tailoring out vs. deleting:**

Tailor Out (TailoredOut = True on the edge) is the Loss Tool operation for
excluding a node from a specific Loss tree while retaining the canonical
relationship. It does NOT remove the underlying [:EXPLOITS] or [:BLOCKS]
relationship.

Explicitly removing a node from the tree (via "Remove from Tree" on the context
menu) removes the [:AT_RELATES_TO] edge with this LossHID. It does NOT remove
the [:EXPLOITS] or [:BLOCKS] canonical relationships.

Deleting an (:Attack) or (:Countermeasure) node from the SoI entirely is a main
GUI Data Drawer operation, not a Loss Tool operation. When this happens
externally, the Loss Tool detects it as an ATTACK_REMOVED or
COUNTERMEASURE_REMOVED finding on next open (Section 6.5.10.12).

**Constraint:**

The Loss Tool SHALL NOT create new (:Attack) or (:Countermeasure) nodes that
have no canonical Core Data relationship to the SoI. Every Attack or
Countermeasure placed in the tree must also be related to the SoI through
[:EXPLOITS] (Attack) or [:BLOCKS]+[:SATISFIES] chain (Countermeasure).

\---

### 6.5.10.12 Diagram Persistence and Validation Snapshot

AttackTreeJSON on (:Loss) serves two purposes:

1. **Layout persistence** — stores the visual presentation state of the diagram.
2. **Validation snapshot** — stores a fingerprint of the Core Data state at the
time of the last successful Commit, enabling change detection.

The complete AttackTreeJSON schema and all finding types are defined in the Core
Data Model (Section 3.3.10.24, Patch LT-10). This section specifies how the
Loss Tool reads and writes it.

**On Commit:**

1. The `layout` section is updated: all node positions (tier, xPosition), edge
curve adjustments, viewport state, metric display settings.
2. The `validationSnapshot` section is refreshed to the current graph state at
Commit time: Environment, States (with StateSequence and VALID_IN status),
Trace entity relationships (with TraceStatus), Attacks (with [:EXPLOITS] targets
and MetricsJSON), and Countermeasures (with [:BLOCKS] targets and MetricsJSON).
3. `validationFindings` is cleared and repopulated from the fresh snapshot
comparison (should be empty immediately after a clean Commit).
4. `attackTreeVersion` is incremented by 1.
5. `builtAt` is set to the Commit timestamp.

**On open (reconciliation):**

The Backend compares the current graph state against the stored
`validationSnapshot`:

1. For each entity in the snapshot: verify it exists in the SoI with the same
HID and NodeType.
2. For each trace entry in the snapshot: verify the entity still has a
relationship to the Loss's Asset with the recorded TraceStatus.
3. For each Attack in the snapshot: verify it still exists and still has the
recorded [:EXPLOITS] targets.
4. For each Countermeasure in the snapshot: verify it still exists and still
has the recorded [:BLOCKS] targets.
5. For each State in the snapshot: verify it still has [:VALID_IN] to the Loss's
Environment.
6. Check for new entities, Attacks, or Countermeasures added since the last build
(INFO findings).

Results populate `validationFindings` in AttackTreeJSON and are returned to the
Frontend in the load response. The Frontend displays the Validation Findings
panel per Section 6.5.10.2.

**Severity and status effect:**

* Any ERROR finding: Backend sets AttackTreeStatus = INVALIDATED.
* WARNING findings only: AttackTreeStatus is unchanged; analyst sees amber
Validation Findings panel.
* INFO findings only: AttackTreeStatus is unchanged; analyst sees blue info
notification (dismissible).

**Reconciling layout after graph changes:**

When the Loss Tool opens with a valid AttackTreeJSON but the graph has changed
(new nodes, removed nodes), it reconciles layout:

* Nodes in JSON not in graph: stale layout entries are silently discarded.
* Nodes in graph not in JSON: auto-assigned to their appropriate tier at the
rightmost available horizontal position in that tier.
* The reconciled layout is written back on the next Commit.

\---

### 6.5.10.13 Performance Requirements

The Loss Tool SHALL:

* Complete the full load (data retrieval + reconciliation) for a (:Loss) with an
existing tree having up to 20 States, 30 entities per State, 10 Attacks per
entity, and 5 Countermeasures per Attack in under 5 seconds.
* Execute auto-build for the same scale from zero in under 8 seconds.
* Execute "Rebuild Tree" (discard layout, rebuild from graph) for the same scale
in under 8 seconds.
* Complete path enumeration for trees with up to 10,000 paths in under 3 seconds.
* Complete metric propagation for trees with up to 10,000 paths in under
5 seconds.
* Render the full canvas (up to 500 nodes) at a consistent frame rate during
zoom, pan, and node selection.
* Respond to canvas node selection with Node Detail Panel update in under
200 milliseconds.
* Display a progress indicator for any Backend operation exceeding 2 seconds.
* Paginate the Attack Path List for path counts over 500; page size = 100 paths.

For trees with path counts exceeding 10,000:

* The Backend SHALL return a statistical sample of up to 10,000 paths.
* The Attack Path List SHALL display "Showing sample of 10,000 of N total paths"
with PathCount = N visible in the top bar.
* The full path count SHALL still be computed and stored as PathCount on (:Loss).

For canvas trees exceeding 2,000 nodes:

* The Loss Tool SHALL enter a compact canvas mode: smaller node labels, reduced
edge curvature, simplified node shapes.
* A "Full Detail" button restores standard rendering at reduced performance.

All Loss Tool write operations SHALL be ACID compliant.
No partial Attack Tree state SHALL be committed on any Backend error.

\---

### 6.5.10.14 Export Requirements

The Loss Tool SHALL support the following export types. All exports are written
to the local file system at a User-selected path via a standard file-save dialog.

**Attack Tree Diagram (PNG or SVG):**

Three variants:

1. Full tree: all tiers, all nodes, full canvas.
2. Viewport: current canvas viewport only.
3. Single path: one highlighted path in full color, remainder at 20% opacity.

All diagram exports preserve: tier labels, node labels (HID + Name), edge
operator labels, metric badges (if currently enabled), all visual state
distinctions (RV, TailoredOut, CompleteBlock, Derived Asset), and the Loss
identity header (Loss Name, Asset, Environment, Criticality, Assurance,
AttackTreeVersion, timestamp).

**Attack Path Report (CSV):**

One row per enumerated path. Columns:

* PathNumber, NodeSequence (semicolon-separated HID list), NodeNameSequence
(semicolon-separated Name list), followed by one column per defined metric
(MetricName_Value, MetricName_PassFail), RVStatus, AllowedRVReason,
LeafAttackHID, LeafAttackName, LeafAttackIsRVCandidate, AttackTreeVersion,
Timestamp.

**Residual Vulnerability Report (Markdown or PDF):**

Structured document containing:

* Header: Loss HID, Name, Asset, Environment, Criticality, Assurance,
AttackTreeVersion, report generated timestamp.
* Executive Summary table: total paths, unaddressed RV count, allowed RV count,
blocked path count, derived asset terminal count; metric pass/fail summary.
* One section per RV path (unaddressed first, then allowed):

  * Path sequence (numbered node list with HID and Name).
  * Metric values and pass/fail per metric.
  * AllowedRV status and AllowedRVReason (if Allowed).
  * Leaf Attack: HID, Name, AttackLevel, ReferenceFramework, ReferenceID,
IsRVCandidate.
* Metric Definitions appendix: full MetricDefinitionsJSON in human-readable table.

**Attack Tree JSON (raw):**

Full AttackTreeJSON property content: layout section, validationSnapshot section,
validationFindings section, attackTreeVersion, timestamps.

Also includes MetricDefinitionsJSON as a companion field.

**Derived Asset Record (Markdown):**

Table of all Derived Assets created in this tree:

* Derived Asset HID, Name, Criticality, Assurance.
* Associated Loss HID(s) for the Derived Asset.
* Parent Countermeasure HID and Name (where in the tree the Derived Asset appears).
* Creation timestamp.

Suitable for traceability from the parent Loss record to spawned Loss analyses.

\---

### 6.5.10.15 Backend Integration Requirements

The Loss Tool SHALL retrieve and mutate data exclusively through the Backend API.

**Required read operations:**

* Load (:Loss) with all properties.
* Load (:Asset) via inverse [:HAS_LOSS].
* Load (:Environment) via [:HAS_ENVIRONMENT] on Loss.
* Load all (:State) nodes with [:VALID_IN] to the Environment, ordered by StateSequence.
* Load all CURRENT [:HOLDS], [:TRANSPORTS], [:USES] from entities to Asset,
filtered by TraceStateHID.
* Load all [:AT_RELATES_TO] edges scoped by LossHID.
* Load all nodes referenced in those edges.
* Load all (:Countermeasure) nodes in the SoI for association picker.
* Load all (:Attack) nodes in the SoI with [:EXPLOITS] associations for addition picker.
* Reconciliation query: compare current graph against validationSnapshot and
return populated validationFindings array.

**Required write operations:**

* Full CRUD on [:AT_RELATES_TO] relationships with all properties.
* DAG acyclicity validation scoped by LossHID before every Commit.
* LossHID consistency validation on all proposed edges.
* SANDSequence uniqueness validation among SAND siblings.
* Update all editable (:Loss) properties (AttackTreeJSON, MetricDefinitionsJSON,
TreeIsValid, TreeHasRVs, PathCount, AttackTreeStatus, AttackTreeVersion,
AttackTreeLastModified, LastTreeBuild).
* Create (:Attack) nodes inline (when User creates Attack within the tree).
* Create (:Countermeasure) nodes inline.
* Create [:EXPLOITS] relationships (when User confirms canonical association).
* Create [:BLOCKS] relationships (when User confirms canonical association).
* Transactional Derived Asset creation: new (:Asset), [:DERIVES], new (:Loss)
nodes, [:HAS_LOSS], new (:GsnGoal) nodes, [:HAS_GOAL], [:AT_RELATES_TO] terminal
edge — all in one ACID transaction.

**Required compute operations:**

* Path enumeration: return all root-to-leaf paths for LossHID (TailoredOut = False
edges only), with bounded max path length (configurable, default 20 nodes).
* Path count: return count without full enumeration.
* Metric propagation: bottom-up calculation for all defined metrics; return
MetricCacheJSON for all edges.
* RV detection: return all leaf (:Attack) nodes with no Countermeasure children
and TailoredOut = False incoming edge.
* Threshold evaluation: return pass/fail per metric at root level.
* Statistical path sampling for trees exceeding 10,000 paths.

All write operations SHALL be ACID compliant.
No partial tree state SHALL be committed on any failure.

\---

### 6.5.10.16 Validation Requirements

The Loss Tool SHALL validate all proposed changes before Commit and SHALL display
specific, actionable messages for each violation.

**Blocking (ERROR) — Commit is prevented:**

|Rule|Message|
|-|-|
|Proposed [:AT_RELATES_TO] edge creates a cycle|"Cannot add this edge: it would create a cycle in the tree. Use a different node or Tailor Out the existing path."|
|Edge LossHID does not match current Loss HID|"Edge LossHID mismatch: internal error. Please Rebuild Tree."|
|TailoredOut = True with null TailorReason|"Tailor Out reason required. Enter a reason in the Node Detail Panel before committing."|
|CompleteBlock = True with null CompleteBlockReason|"Complete Block reason required. Enter a justification in the Node Detail Panel."|
|AllowedRV = True with null AllowedRVReason|"Allowed RV reason required. Enter a documented justification (minimum 20 characters)."|
|AllowedRVReason shorter than 20 characters|"Allowed RV reason must be at least 20 characters to be sufficient for certification evidence."|
|SAND siblings with duplicate SANDSequence values|"Duplicate SAND sequence values among siblings under {parent HID}. Reassign unique sequence numbers."|
|SAND siblings with non-contiguous SANDSequence values|"Non-contiguous SAND sequence values under {parent HID}. Renumber to fill gaps."|
|Derived Asset creation: null Asset Name|"Derived Asset requires a Name."|
|New Attack or Countermeasure node has null Name|"Name is required for all new nodes."|

**Warning (non-blocking) — Commit proceeds with notification:**

|Condition|Notification|
|-|-|
|Unaddressed RVs present after Commit|"Tree committed with {N} unaddressed Residual Vulnerabilities. These must be addressed or acknowledged before the tree can be submitted for certification."|
|Metric root value fails AcceptanceThreshold|"Metric '{MetricName}' root value {value} {direction} threshold {threshold}. FAIL."|
|State in tree has no [:VALID_IN] to Loss's Environment|"State {HID} was manually placed but has no [:VALID_IN] to {Environment Name}. This may indicate an analytical inconsistency."|
|Entity in tree has no CURRENT Trace coverage for Loss Asset|"Entity {HID} was manually placed but has no CURRENT Trace relationship to {Asset Name}. Verify with Trace Tool."|
|Metric defined on Loss but no leaf Attacks have MetricsJSON for it|"Metric '{MetricName}' has no values on leaf nodes. All paths will use LeafDefault = {default}."|
|validationFindings contains WARNING findings after reconciliation|"Validation warnings exist from changes since last build. Review findings above."|

**INFO — Logged in validationFindings, shown in Validation Findings panel:**

* New entities with CURRENT Trace coverage for the Asset added since last build.
* New Attacks associated to tree entities via [:EXPLOITS] since last build.
* New Countermeasures associated to tree Attacks via [:BLOCKS] since last build.

\---

### 6.5.10.17 Test and Verification Requirements

The Loss Tool SHALL be verified through test and analysis.

The system SHALL verify that:

**Invocation and mode selection:**

* Opening with a (:Loss) Data Drawer context loads the correct Loss directly.
* Opening without context displays the Loss Selector.
* The Loss Selector shows correct AttackTreeStatus badges and PathCounts.
* A Loss with no CURRENT Trace data opens in Trace Coverage Mode with the
correct warning and disabled "Proceed to Tree" button.
* A Loss with AttackTreeJSON = Null auto-builds and opens in Attack Tree
Construction Mode.
* A Loss with AttackTreeStatus = INVALIDATED opens with the Validation Findings
panel expanded.

**Trace Coverage Mode:**

* CURRENT, SUPERSEDED, INVALIDATED, and empty cells display correctly.
* "Proceed to Tree" is enabled only when at least one State has CURRENT coverage.
* Cell display matches actual TraceStatus on the [:HOLDS]/[:TRANSPORTS]/[:USES]
edges for the Loss's Asset.

**Auto-build:**

* Auto-build creates all expected [:AT_RELATES_TO] edges with correct LossHID.
* Default LogicOperators are applied correctly per tier.
* SANDSequence is Null for OR-operator edges.
* StateSequence values are correctly used to pre-populate SANDSequence when
the User converts State siblings to SAND.
* Auto-build commits as a single ACID transaction and rolls back completely on
Backend error, leaving AttackTreeStatus = NOT_BUILT.
* After auto-build, TreeIsValid = True when at least one path exists.

**Logical operator editing:**

* Changing an edge LogicOperator from OR to SAND enables SANDSequence editing
on all sibling edges from the same parent.
* Commit is blocked when SAND siblings have duplicate SANDSequence values.
* Commit is blocked when SAND siblings have non-contiguous SANDSequence values.

**Tailor Out:**

* Tailoring out an edge sets TailoredOut = True; the node is excluded from path
enumeration and metric propagation but remains visible (muted, dashed).
* Commit is blocked when TailoredOut = True but TailorReason is null.
* Restoring a tailored-out edge sets TailoredOut = False and clears TailorReason.

**Metric system:**

* Metric definition is correctly stored in MetricDefinitionsJSON on Commit.
* Bottom-up metric propagation for AttackCost (SUM/MIN/SUM) produces correct
values for a known tree with known leaf values.
* Bottom-up metric propagation for AttackProbability (PRODUCT/MAX/PRODUCT)
produces correct values.
* Threshold pass/fail evaluation correctly applies ThresholdDirection.
* MetricCacheJSON on edges reflects the correct computed value at each edge.
* Changing MetricDefinitionsJSON triggers full recalculation on Commit.

**Residual Vulnerabilities:**

* RV detection correctly identifies leaf Attack nodes with no Countermeasure
children and TailoredOut = False on incoming edge.
* TreeHasRVs = True when any Unaddressed RVs exist.
* TreeHasRVs = False when all RVs are Allowed or blocked.
* AllowedRV = True with AllowedRVReason persists correctly.
* Commit is blocked when AllowedRVReason is null or shorter than 20 characters.
* Revoking AllowedRV restores the path to Unaddressed RV status.

**Derived Assets:**

* Derived Asset creation commits the full transaction (Asset + Loss + Goal +
DERIVES + AT_RELATES_TO) atomically; rolls back on any failure.
* Derived Asset Assurance may differ from primary Asset Assurance.
* Spawn indicator navigates to the Derived Asset's Loss Selector.
* New Loss nodes for Derived Asset have AttackTreeStatus = NOT_BUILT and no
[:HAS_ENVIRONMENT] (pending Context Tool).

**Relationship synchronization:**

* When adding an Attack inline, the tool prompts to create [:EXPLOITS] and
creates it when User confirms.
* The tree-only option (no [:EXPLOITS]) does not create the canonical relationship.
* The Loss Tool does not create [:AT_RELATES_TO] edges that would create cycles.
* The Loss Tool does not create (:Attack) nodes without at least one canonical
relationship on confirmation.

**Validation snapshot:**

* Reconciliation correctly detects ENTITY_REMOVED when an entity is deleted from
the SoI after the last build.
* Reconciliation correctly detects ATTACK_REMOVED when an Attack is deleted.
* Reconciliation correctly detects TRACE_INVALIDATED when a Trace relationship
is invalidated.
* AttackTreeStatus = INVALIDATED is set when any ERROR finding is present.
* WARNING-only findings do not change AttackTreeStatus.
* After Rebuild Tree, validationFindings = empty array (clean build).

**Path Analysis Mode:**

* Path enumeration returns correct path count for a known tree.
* Default sort orders paths by first metric ascending.
* Single-path highlight mutes all other nodes to 20% opacity.
* Escape restores full-tree display from highlight mode.

**Exports:**

* PNG export preserves tier labels, node labels, and edge operator labels.
* CSV path report includes all metric columns and RV status.
* RV Report Markdown contains correct AllowedRVReason entries.
* JSON export produces valid AttackTreeJSON content.

**General:**

* Opening the Loss Tool does not change the current SoI.
* No partial tree state is committed on Backend error.
* All write operations roll back completely on Backend failure.
* AttackTreeVersion increments by exactly 1 on every successful Commit.

\---

### 6.5.10.18 UX Design Principles

The Loss Tool SHALL render Attack Tree diagrams conforming to KerML 1.0
conventions for directed analytical graphs, adapted to the SSTPA Tools visual
style.

The Loss Tool SHALL render Attack Tree diagrams using the SSTPA visual
conventions below. KerML 1.0 defines
textual and abstract syntax, not diagram conventions; the standard-conformant
representation of the Attack Tree is the KerML 1.0 text defined in Section
3.7 and displayed in the Model Text Panel (Section 6.5.10.21).



\---

**Overall layout:**

* Vertical DAG: root at top, tiers descend.
* Fixed tier-band spacing: 120px per tier at 100% zoom; scales with zoom.
* Left-margin tier labels: T0, T1, T2, T3, T4, T5, T6+; monospaced, subdued.
* Nodes within a tier are horizontally distributed; User drag adjusts within band.
* The (:Loss) root node is centered horizontally.
* A minimap in the lower-right corner shows the full tree at reduced scale with
a viewport indicator.

\---

**Node visual treatment:**

|Node Type|Shape|Color Family|Label|
|-|-|-|-|
|(:Loss) at T0|Rounded rectangle, large|Gold/amber (certification authority color)|Loss Name + Asset Name|
|(:Environment) at T1|Rounded rectangle|Teal|"ENV:" + Environment Name|
|(:State) at T1|Rectangle|Blue-grey|"ST:" + State Name + StateSequence badge|
|(:Interface) at T2|Rectangle, INT badge|Navy|"INT:" + Name|
|(:SystemFunction) at T2|Rectangle, FUN badge|Slate blue|"FUN:" + Name|
|(:Component) at T2|Rectangle, EL badge|Steel blue|"EL:" + Name|
|(:Attack) STRATEGY|Parallelogram, bold border|Red family (dark)|"ATK:" + Name|
|(:Attack) TACTIC|Parallelogram, standard|Red family (medium)|"ATK:" + Name|
|(:Attack) PROCEDURE|Parallelogram, thin border|Red family (light)|"ATK:" + Name|
|(:Countermeasure) standard|Shield-adjacent rectangle|Blue|"CM:" + Name|
|(:Countermeasure) CompleteBlock|Shield-adjacent, filled|Blue (solid)|"CM:" + Name + lock badge|
|Derived (:Asset) terminal|Diamond|Purple|"DA:" + Name + spawn arrow|

RV overrides (applied on top of above):

* Unaddressed RV Attack leaf: red border (2px solid).
* Allowed RV Attack leaf: amber border (2px solid).

Metric badge (when enabled): small pill below node label showing metric name
abbreviation and value. Pass: green pill. Fail: red pill. No threshold: grey pill.

\---

**Edge visual treatment:**

|LogicOperator|Color|Style|
|-|-|-|
|AND|Blue|Solid line, 1.5px|
|OR|Green|Solid line, 1.5px|
|SAND|Orange|Solid line, 1.5px; SANDSequence badge on target end|
|TailoredOut = True (any operator)|Grey|Dashed line, 1px, 50% opacity|

Staged (uncommitted) edges: the edge uses the standard color family but with a
dashed stroke pattern and a small "staged" label near the midpoint.

\---

**Staged changes visual treatment:**

* New staged node: dashed border (2px dashed, same color as node type).
* Changed node property: amber dot on node label corner.
* Changed edge property: edge rendered in its operator color with dashed pattern.
* Reverted node/edge: returns immediately to committed visual state.
* The Commit and Revert toolbar buttons are active only when staged changes exist.
* A staged-changes count badge ("N changes staged") appears in the toolbar.

\---

**Path highlight mode:**

* Selected path: 100% opacity, all standard colors.
* All other nodes and edges: 20% opacity.
* Canvas layout unchanged; no node movement on highlight.
* "Clear Highlight" button in toolbar. Escape key also clears.
* If the selected path contains TailoredOut edges, those edges remain dashed
even at 100% opacity to make the tailoring decision visible in the path view.

\---

**Validation Findings panel:**

* ERROR row: red left border, red severity icon, red "ERROR" label.
* WARNING row: amber left border, amber severity icon, amber "WARNING" label.
* INFO row: blue left border, blue info icon, blue "INFO" label.
* Affected node HID in each row is a clickable link that highlights the node in
the canvas and centers the viewport on it.
* The panel collapse toggle (chevron) collapses the panel body but leaves the
summary line visible.

\---

**Attack Path List (Attack Path Analysis Mode):**

* Unaddressed RV paths: row has a red left border and red "RV" badge.
* Allowed RV paths: row has an amber left border and amber "RV✓" badge.
* Blocked paths (CompleteBlock leaf): green badge "BLOCKED".
* Derived Asset terminal paths: blue badge "DERIVED".
* Sort column headers are clickable; active sort column is indicated by a
directional arrow icon.
* The highlighted path row (when "Highlight" is active) has a filled background
in the appropriate severity color.

\---

**Bottom Bar metric panels:**

Each metric panel uses a compact horizontal layout:

* MetricName label (left).
* Computed value (center, monospaced, 4 significant figures).
* "/" AcceptanceThreshold (center, if defined).
* Pass/fail icon (right): ✓ green or ✗ red.
* Mini progress bar spanning the full width of the panel beneath the labels.

\---

### 6.5.10.19 Countermeasure Creation and Management

The Loss Tool SHALL allow the User to create new (:Countermeasure) nodes inline
during Attack Tree construction, in addition to associating existing ones.

**Creating a Countermeasure inline:**

From the context menu on any T3/T5 Attack node, the User selects "Add New
Countermeasure Here." The tool presents a creation form:

* Name (required).
* ShortDescription (required).
* LongDescription (optional).
* MetricsJSON: key-value editor for metric contribution values (optional).

On Commit:

1. Create (:Countermeasure) node with required common properties.
2. Create (:Security)-[:HAS_COUNTERMEASURE]->(Countermeasure) to associate it
to the SoI's Security view.
3. Create (:Countermeasure)-[:BLOCKS]->(Attack) canonical relationship.
4. Create [:AT_RELATES_TO] edge from Attack to Countermeasure (LossHID,
LogicOperator = AND).

All four operations SHALL commit as a single ACID transaction.

**Associating an existing Countermeasure:**

From the context menu, "Add Existing Countermeasure" opens a picker showing all
(:Countermeasure) nodes in the active SoI. The picker supports search by name
and HID. Selecting a Countermeasure:

* If [:BLOCKS] exists between the Countermeasure and the Attack: creates only the
[:AT_RELATES_TO] edge.
* If [:BLOCKS] does NOT exist: prompts "Add canonical [:BLOCKS] relationship?"
(same prompt as Section 6.5.10.11).

**Countermeasure metric contribution:**

A Countermeasure with MetricsJSON values contributes to the path metric when
the path passes through it. This models a countermeasure that raises the
cost or reduces the probability of a successful attack path (but does not
completely block it). The contribution is applied by the metric propagation
engine as defined by the aggregation formula for the edge's LogicOperator.

**CompleteBlock semantics:**

A (:Countermeasure) marked CompleteBlock = True with a documented
CompleteBlockReason asserts that this countermeasure unconditionally prevents the
attack from succeeding on any path passing through it. This is a strong
analytical claim and requires documented justification. The certification
authority will scrutinize CompleteBlock claims as they terminate RV paths.

The CompleteBlockReason should explain, with reference to design documentation or
verification evidence, why no counter-attack can defeat this countermeasure.

\---

### 6.5.10.20 Goal Keeper Tool Integration

The Loss Tool and the Goal Keeper Tool work together to build the certification
argument for each Loss. The Loss Tool produces the analytical evidence (Attack
Tree, RV Records, metric results); the Goal Keeper Tool structures that evidence
into a formal Goal Structured Notation (GSN) assurance case.

**Integration point:**

Each (:Loss) node is associated with a Root (:GsnGoal) node via
(:Asset)-[:HAS_GOAL]->(Root Goal). The Root Goal is auto-generated when the
Loss is created (see Asset Manager Tool Section 6.5.7.9).

The Root Goal's GoalStatement is initialized to:
"The {Criticality} of {Assurance} of {Asset Name} in {Environment Name} is acceptable."

**Evidence references:**

The Goal Keeper Tool allows (:GsnSolution) nodes to reference evidence-bearing
nodes via [:HAS_LOSS]->(:Loss). A (:GsnSolution) that references a (:Loss) node
represents the claim that the Loss Tree analysis constitutes evidence for the
GSN goal argument.

When the Loss Tool exports a Residual Vulnerability Report, the export is
suitable for attachment to a (:GsnSolution) node in the Goal Keeper Tool as
external evidence.

**Navigation:**

The Loss Tool toolbar includes a "Launch Goal Keeper Tool" button that opens
the Goal Keeper Tool with the Root Goal associated with the current Loss. This
allows the analyst to navigate directly from the Loss analysis to the GSN
argument structure without leaving the Loss Tool session.

**Completeness indicator:**

The Loss Tool SHALL display a Goal completeness badge in the top bar showing:

* "Goal: Complete" (green) if the Root Goal has at least one (:GsnSolution) node
with a valid evidence reference.
* "Goal: Incomplete" (amber) if the Root Goal exists but has no Solution nodes
with evidence.
* "Goal: Not Started" (grey) if no Root Goal exists for this Loss.

A Loss with AttackTreeStatus = BASELINED and Goal = Incomplete generates a
WARNING finding: "Loss is baselined but certification argument (Goal Structure)
is incomplete."


### 6.5.10.21 Model Text Panel

ModelTextLanguages: ["KERML"]. Scope: the open Loss's Attack Tree — the
Loss feature, AtAnd/AtOr/AtSand connectors with edge attributes, SAND
successions, metric definitions and values per Sections 3.7.5–3.7.7. Edit
mode is permitted (the Loss Tool is the sole authorized mutator of
[:AT_RELATES_TO], Section 3.3.4.11); gate-consistency (Section 3.3.4.11)
is validated on every text validation pass.



\---

### 6.5.11  The Goal Keeper Tool

#### 6.5.11.1 Purpose

The Goal Keeper Tool is an Add-on Tool used to create, display, edit, validate, persist, and export a formal certification argument for an Asset Loss using Goal Structuring Notation (GSN) Community Standard Version 3 concepts but modeling the objecsts per KerML 1.0 (similar to the other Add-on Tools).
The Goal Keeper Tool SHALL represent the certification argument as a Directed Acyclic Graph (DAG) rooted at a single (:GsnGoal) node associated with an (:Asset) and its corresponding (:Loss).
The Root Goal SHALL be automatically created when the Frontend creates the associated (:Asset) and (:Loss) nodes.
The Goal Keeper Tool SHALL allow the User to construct an assurance case by creating, associating, arranging, editing, and saving GSN nodes and relationships according to GSN rules.
The GSN DAG SHALL terminate in (:GsnSolution) nodes. (:GsnSolution) nodes SHALL reference evidence-bearing SSTPA nodes, including:

• (:Validation)
• (:Verification)
• (:Loss)

The Goal Keeper Tool SHALL preserve both:

1. the authoritative semantic graph stored in the Backend as nodes and relationships; and
2. the user-manipulated visual layout stored as structured diagram JSON.

The tool described here SHALL be branded at the top of the pop-up window as “Goal Keeper Tool”.

\---

#### 6.5.11.2 Tool Wireframe



#### 6.5.11.3 Invocation

The Goal Keeper Tool SHALL be launched from the SSTPA Control Panel.
If a Data Drawer is open for a (:GsnGoal), the Goal Keeper Tool SHALL open the Goal Structure rooted at that (:GsnGoal).
If a Data Drawer is open for an (:Asset), the Goal Keeper Tool SHALL display the Goal Structures associated with that Asset and allow the User to open one.
If a Data Drawer is open for a (:Loss), the Goal Keeper Tool SHALL open the Goal Structure associated with that Loss, if one exists.
If no valid Data Drawer context exists, the Goal Keeper Tool SHALL present the User with a list of available (:Asset), (:Loss), and Root (:GsnGoal) combinations in the current SoI.

The selection list SHALL display:

• Asset HID
• Asset Name
• Loss HID
• Loss Name
• Root Goal HID
• Root Goal Name
• Criticality
• Assurance
• Environment
• Goal Structure status, if available



Selecting a Goal Structure SHALL open the associated GSN DAG.

Opening the Goal Keeper Tool SHALL NOT change the current SoI.

\---



#### 6.5.11.4 Supported Node Context



The Goal Keeper Tool SHALL support invocation when the Data Drawer is open for:

• (:Asset)
• (:Loss)
• (:GsnGoal)
• (:GsnStrategy)
• (:GsnContext)
• (:GsnJustification)
• (:GsnAssumption)
• (:GsnSolution)
• (:Validation)
• (:Verification)



The tool SHALL load all GSN nodes reachable from the selected Root Goal using valid GSN relationships.
The tool SHALL load referenced evidence nodes needed to display terminal Solution evidence.
The tool SHALL allow the User to shift focus within the Goal Structure without changing the current SoI.
The tool SHALL provide a back action to return to the invoking context.

\---



#### 6.5.11.5 Modes of Operation

The Goal Keeper Tool SHALL support the following modes:

a. Goal Structure View

• Displays the full GSN DAG rooted at the selected Root Goal
• Allows selection of GSN nodes and relationships
• Allows creation and association of valid GSN nodes
• Allows editing of GSN node properties
• Allows association of evidence nodes to Solution nodes
• Allows manual diagram layout and visual organization



b. Evidence View

• Displays terminal (:GsnSolution) nodes and their referenced evidence
• Allows inspection of linked (:Validation), (:Verification), and (:Loss) nodes
• Highlights unsupported Goals and Solutions without evidence
• Allows the User to navigate from evidence to the supporting Goal path



c. Validation View

• Displays structural completeness and rule violations
• Identifies unsupported Goals
• Identifies terminal Goals without Solutions
• Identifies Solutions without evidence
• Identifies unreachable GSN nodes
• Identifies invalid relationship types
• Identifies cycle attempts or detected cycles
• Provides actionable remediation messages



d. Presentation / Export View
• Provides a clean report-oriented rendering of the Goal Structure
• Preserves GSN shapes, labels, relationships, and evidence references
• Allows export of the current viewport or full Goal Structure

\---

Performance Requirements
Test and Verification Requirements



\---

#### 6.5.11.6 GSN Node Types



The Goal Keeper Tool SHALL support the following GSN node types:

• (:GsnGoal)
• (:GsnStrategy)
• (:GsnContext)
• (:GsnJustification)
• (:GsnAssumption)
• (:GsnSolution)



The Root Goal SHALL be a (:GsnGoal) node.
The Root Goal SHALL represent the top-level certification claim for a specific Asset-Loss case.
(:GsnGoal) nodes SHALL represent claims.
(:GsnStrategy) nodes SHALL represent reasoning or inference patterns used to decompose or support Goals.
(:GsnContext) nodes SHALL represent contextual information needed to interpret a Goal or Strategy.
(:GsnJustification) nodes SHALL represent rationale supporting a Goal or Strategy.
(:GsnAssumption) nodes SHALL represent assumptions relied upon by a Goal or Strategy.
(:GsnSolution) nodes SHALL represent references to evidence supporting a Goal.

\---



#### 6.5.11.7 GSN Relationship Types

The Goal Keeper Tool SHALL support the following relationships:

(:GsnGoal)-[:SUPPORTED_BY]->(:GsnGoal)
(:GsnGoal)-[:SUPPORTED_BY]->(:GsnStrategy)
(:GsnGoal)-[:SUPPORTED_BY]->(:GsnSolution)
(:GsnGoal)-[:IN_CONTEXT_OF]->(:GsnContext)
(:GsnGoal)-[:IN_CONTEXT_OF]->(:GsnJustification)
(:GsnGoal)-[:IN_CONTEXT_OF]->(:GsnAssumption)

(:GsnStrategy)-[:SUPPORTED_BY]->(:GsnGoal)
(:GsnStrategy)-[:SUPPORTED_BY]->(:GsnSolution)
(:GsnStrategy)-[:IN_CONTEXT_OF]->(:GsnContext)
(:GsnStrategy)-[:IN_CONTEXT_OF]->(:GsnJustification)
(:GsnStrategy)-[:IN_CONTEXT_OF]->(:GsnAssumption)

(:GsnContext)-[:HAS_ENVIRONMENT]->(:Environment)

(:GsnSolution)-[:HAS_VALIDATION]->(:Validation)
(:GsnSolution)-[:HAS_VERIFICATION]->(:Verification)
(:GsnSolution)-[:HAS_LOSS]->(:Loss)

The Backend SHALL validate all Goal Keeper relationships before commit.

The Goal Keeper DAG SHALL NOT contain cycles.

The Backend SHALL reject any relationship that would create a cycle in the Goal Structure.

The Backend SHALL prevent duplicate logical GSN relationships between the same source node, target node, and relationship type.



\---



#### 6.5.11.8 GSN Structure Rules



A Goal Structure SHALL have exactly one Root Goal.

The Root Goal SHALL have no incoming [:SUPPORTED_BY] relationship from another GSN node within the same Goal Structure.

Every non-root GSN node SHALL be reachable from the Root Goal.

A (:GsnGoal) node MAY be supported by one or more (:GsnGoal), (:GsnStrategy), or (:GsnSolution) nodes.

A (:GsnStrategy) node SHALL be used to explain how a Goal is decomposed into supporting Goals or Solutions.

A (:GsnStrategy) node SHOULD have at least one outgoing [:SUPPORTED_BY] relationship to a (:GsnGoal) or (:GsnSolution).

A (:GsnSolution) node SHALL be terminal with respect to [:SUPPORTED_BY] relationships.

A (:GsnSolution) node SHALL NOT have outgoing [:SUPPORTED_BY] relationships.

A (:GsnSolution) node SHALL reference at least one evidence-bearing node before the Goal Structure can be marked complete.



Valid evidence-bearing references for (:GsnSolution) are:



• (:Validation)

• (:Verification)

• (:Loss)



(:GsnContext), (:GsnJustification), and (:GsnAssumption) nodes SHALL NOT support Goals directly through [:SUPPORTED_BY].

(:GsnContext), (:GsnJustification), and (:GsnAssumption) nodes SHALL only be related through [:IN_CONTEXT_OF] or explicitly authorized context relationships.



The Goal Keeper Tool SHALL visually identify incomplete or invalid GSN structures.



\---

\---



#### 6.5.11.9 Diagram Persistence Requirements



The Goal Keeper Tool SHALL persist the visual state of the Goal Structure as structured JSON.

The persisted diagram JSON SHALL store presentation and reconstruction data only.

The persisted diagram JSON SHALL NOT be authoritative for semantic GSN relationships.

The authoritative Goal Structure SHALL be the Neo4j graph of GSN nodes and relationships.

The persisted diagram JSON SHALL include:



• schema version

• Root Goal HID

• Root Goal uuid

• tool type

• viewport

• zoom level

• node positions

• edge routing

• collapsed/expanded state

• display toggles

• layout mode

• selected visual options

• evidence panel display state



The Goal Keeper Tool SHOULD use the common Diagram View Persistence Model defined for graphical Add-on Tools.

If the SRS does not yet define a common (:DiagramView) node, the Goal Keeper Tool MAY persist diagram JSON in the (:GsnGoal).GoalStructure property for MVP implementation.

Future versions SHOULD migrate (:GsnGoal).GoalStructure into a common (:DiagramView) node related to the Root Goal.

On opening an existing Goal Structure, the Frontend SHALL:



1. retrieve the authoritative GSN graph from the Backend;
2. retrieve the persisted diagram JSON, if present;
3. reconcile saved diagram references against existing graph nodes and relationships;
4. restore valid node positions, edge routing, viewport, and display options;
5. ignore stale references to deleted nodes or relationships;
6. visually notify the User if stale references were ignored.



On Commit, semantic graph changes and diagram JSON changes SHALL be committed transactionally.

If semantic graph persistence succeeds but diagram JSON persistence fails, the entire transaction SHALL roll back unless the User explicitly elects to save semantic changes without layout persistence.



\---



#### 6.5.11.10 Node Creation and Editing



The Goal Keeper Tool SHALL allow creation of the following nodes:



• (:GsnGoal)

• (:GsnStrategy)

• (:GsnContext)

• (:GsnJustification)

• (:GsnAssumption)

• (:GsnSolution)



Creation SHALL:



• use the standard SSTPA staged editing and Commit confirmation model;

• assign valid HID and uuid values;

• assign the node to the active SoI;

• assign valid GSN ID values;

• assign Owner, Creator, Created, and LastTouch properties according to SRS ownership rules;

• open the created node in the Goal Keeper detail panel or Data Drawer for editing.



The Goal Keeper Tool SHALL allow editing of:



• Name

• ShortDescription

• LongDescription

• GoalStatement

• StrategyStatement

• ContextStatement

• JustificationStatement

• AssumptionStatement

• SolutionStatement



The Goal Keeper Tool SHALL NOT allow editing of fixed identity properties except as allowed by Admin rules.



\---



#### 6.5.11.11 Relationship Creation and Editing



The Goal Keeper Tool SHALL allow the User to create valid GSN relationships by dragging, selecting, or using explicit Add Relationship actions.

The tool SHALL visually distinguish valid and invalid relationship targets.

Invalid relationship targets SHALL be muted or disabled.

The tool SHALL prevent Commit until all staged relationships pass Backend validation.



Relationship creation SHALL validate:



• source node type

• target node type

• relationship type

• same SoI constraint

• Root Goal reachability

• DAG acyclicity

• duplicate relationship prevention

• GSN rule compliance



The tool SHALL allow deletion of GSN relationships subject to orphan and structural validation rules.



If deleting a relationship causes one or more GSN nodes to become unreachable from the Root Goal, the tool SHALL warn the User before Commit.



\---



#### 6.5.11.12 Solution Evidence Association



The Goal Keeper Tool SHALL allow (:GsnSolution) nodes to reference evidence-bearing SSTPA nodes.



The tool SHALL allow association of:



• (:GsnSolution)-[:HAS_VALIDATION]->(:Validation)

• (:GsnSolution)-[:HAS_VERIFICATION]->(:Verification)

• (:GsnSolution)-[:HAS_LOSS]->(:Loss)



The tool SHALL allow multiple evidence references per (:GsnSolution).

The tool SHALL display evidence references in a list box attached to or visually associated with the Solution node.



The evidence list SHALL display:



• Evidence node type

• HID

• Name

• ShortDescription

• Verification or Validation method, where applicable

• Loss Criticality and Assurance, where applicable



The tool SHALL allow opening an evidence node in read-only inspection mode when the evidence node is outside the current editable context.

The tool SHALL allow opening an evidence node for edit when it belongs to the current SoI and the User has edit authority.

A (:GsnSolution) node without at least one evidence reference SHALL be visually marked incomplete.



\---



#### 6.5.11.13 Asset, Loss, and Root Goal Integration



When a new (:Asset) and associated (:Loss) are created, the Frontend SHALL automatically create the corresponding Root (:GsnGoal).

There SHALL be one Root (:GsnGoal) for each certification argument associated with an Asset-Loss case.

The Root Goal SHOULD be initialized with a default GoalStatement derived from:



• Asset Name

• Asset HID

• Loss Name

• Loss HID

• Criticality

• Assurance

• Environment



Example default Root Goal statement:



“The evidence supports certification that [Asset] maintains [Assurance] for [Criticality] in [Environment] such that [Loss] is acceptably mitigated.”

The User SHALL be able to edit the Root Goal statement.

The Goal Keeper Tool SHALL preserve the association among:



• (:Asset)

• (:Loss)

• Root (:GsnGoal)



The tool SHALL NOT allow deletion of the Root Goal without explicit warning that the certification argument for the Asset-Loss case will be removed.



\---



#### 6.5.11.14 Validation Requirements



The Goal Keeper Tool SHALL validate all proposed mutations through the Backend API before Commit.



Validation SHALL confirm:



• exactly one Root Goal exists for the opened Goal Structure;

• the Goal Structure is a DAG;

• all non-root GSN nodes are reachable from the Root Goal;

• all relationship types are valid for their source and target node types;

• no duplicate logical relationships exist;

• all Solution nodes terminate the supported-by structure;

• Solution nodes do not have outgoing [:SUPPORTED_BY] relationships;

• Solution nodes marked complete have at least one evidence reference;

• GSN IDs are unique within the Goal Structure;

• all nodes belong to the same SoI unless explicitly allowed by evidence-reference rules;

• diagram JSON is well formed and compatible with the supported schema version.



The API SHALL return:



• valid / invalid

• reason for invalidity

• affected node HID or relationship

• recommended corrective action, where practical



\---



#### 6.5.11.15 Interaction Requirements



The Goal Keeper diagram SHALL support:



• zoom

• pan

• node selection

• relationship selection

• hover highlighting

• drag-to-position nodes

• drag-to-create relationships where practical

• animated centering

• expand/collapse of branches

• expand/collapse of evidence lists

• keyboard navigation

• Escape to close

• undo of staged, uncommitted diagram operations

• Commit confirmation



Selecting a node SHALL:



• highlight the node;

• display its properties;

• display incoming and outgoing relationships;

• display validation state;

• display available actions for that node type.



Selecting a relationship SHALL:



• highlight the relationship;

• display source node, target node, and relationship type;

• display validation state;

• allow deletion if permitted.



\---



#### 6.5.11.16 Layout Requirements

The Goal Keeper Tool SHALL support:

• manual layout
• hierarchical top-down layout
• hierarchical left-to-right layout
• automatic layout on demand

The layout engine SHALL preserve relative node positioning where feasible.
Switching layout modes SHALL NOT discard User-created manual positioning unless the User confirms re-layout.
The tool SHALL maintain layout stability during:
• selection
• editing
• validation
• evidence association
• branch expansion
• mode switching
• save and reopen

\---



#### 6.5.11.17 Search and Navigation



The Goal Keeper Tool SHALL provide search within the open Goal Structure.



Search SHALL support:



• HID

• uuid

• GSN ID

• Name

• node type

• statement text

• evidence HID

• evidence node type



Search results SHALL:



• be listed in a synchronized results panel;

• highlight matching nodes in the diagram;

• allow centering on a selected result;

• prioritize exact HID, uuid, and GSN ID matches.



The tool SHALL provide a path-to-root display for the selected node.



The path-to-root display SHALL show the chain from Root Goal to selected node.



\---



#### 6.5.11.18 Data Drawer Integration



On successful selection from the Goal Keeper Tool, the calling Data Drawer SHALL be able to display:



• related GSN nodes

• GSN relationships

• evidence references

• validation status

• Goal Structure status



The Data Drawer SHALL allow:



• launching the Goal Keeper Tool from valid node context;

• opening related GSN nodes;

• opening referenced evidence nodes;

• removing valid relationships subject to validation and deletion rules;

• refreshing after commit.



The Main Panel SHALL refresh after the Goal Keeper Tool commits changes.



\---



#### 6.5.11.19 Export Requirements



The Goal Keeper Tool SHALL support export of Goal Structures.



Supported export formats SHALL include:



• PNG

• SVG

• JSON

• Markdown summary



The PNG and SVG exports SHALL preserve:



• GSN node shapes

• node labels

• statement text

• relationship direction

• relationship style

• evidence list boxes

• visible validation markers, if enabled



The JSON export SHALL include:



• diagram schema version

• Root Goal HID and uuid

• GSN nodes

• GSN relationships

• evidence references

• layout information

• viewport and display settings



The User SHALL be able to export:



• current viewport

• full visible Goal Structure

• evidence summary

• validation findings



Exports SHALL be suitable for insertion into System Description, System Specification, certification package, and body-of-evidence reports.



\---



#### 6.5.11.20 Performance Requirements



The Goal Keeper Tool SHALL:



• efficiently load Goal Structures for the active SoI;

• support progressive loading for large Goal Structures;

• maintain UI responsiveness during layout, editing, validation, and export;

• use bounded traversal for all recursive GSN queries;

• prevent unbounded recursive graph expansion;

• support lazy loading of evidence-node detail.



Exact HID, uuid, and GSN ID lookup SHALL be faster than general text search.



\---



#### 6.5.11.21 Backend Integration Requirements



The Goal Keeper Tool SHALL retrieve and mutate data through the Backend API.



Required Backend capabilities include:



• retrieval of Root Goal by Asset and Loss;

• retrieval of complete GSN DAG by Root Goal;

• retrieval of GSN node properties;

• retrieval of GSN relationships;

• retrieval of Solution evidence references;

• validation of GSN relationship creation;

• validation of DAG acyclicity;

• validation of Solution evidence completeness;

• transactional creation, update, and deletion of permitted GSN nodes;

• transactional creation and deletion of permitted GSN relationships;

• transactional persistence of diagram JSON;

• export data retrieval.



All Goal Keeper write operations SHALL be ACID compliant.

All semantic graph mutations and diagram persistence updates SHALL commit as a single transaction unless explicitly separated by User confirmation.



\---



#### 6.5.11.22 Error Handling



If validation fails, the Goal Keeper Tool SHALL display:



• failure status;

• specific rule violated;

• affected node or relationship;

• recommended corrective action, where practical.



No partial Goal Structure mutation SHALL be committed.



If diagram JSON cannot be reconciled with the current semantic graph, the tool SHALL:



• open the valid portion of the Goal Structure;

• ignore stale layout references;

• notify the User;

• allow the User to save the repaired layout.



If a referenced evidence node has been deleted, the tool SHALL mark the associated Solution as incomplete.



\---



#### 6.5.11.23 Reporting and Certification Package Support



The Goal Keeper Tool SHALL support certification-package workflows.



The tool SHALL allow Users to:



• frame and export portions of the Goal Structure;

• generate a complete evidence summary;

• identify unsupported claims;

• identify claims supported only by assumptions;

• identify Solutions lacking evidence;

• identify referenced Loss, Verification, and Validation nodes;

• preserve reproducible diagram states for reports.



The Goal Keeper Tool SHALL support generation of figures and summaries suitable for future certification argument reports.



\---



#### 6.5.11.24 Test and Verification Requirements



The Goal Keeper Tool SHALL be verified through test and analysis.



The system SHALL verify that:



• Root Goals are automatically created with Asset-Loss creation;

• a Goal Structure opens from Asset, Loss, or Goal context;

• GSN nodes are created with valid HID, uuid, and GSN ID values;

• valid GSN relationships are accepted;

• invalid GSN relationships are rejected;
• cycle creation is rejected;
• duplicate logical relationships are rejected;
• non-root unreachable nodes are detected;
• Solution nodes can reference Validation, Verification, and Loss nodes;
• Solution nodes without evidence are marked incomplete;
• diagram JSON persists and reloads correctly;
• stale diagram references are handled gracefully;
• exports preserve visible GSN structure;
• all write operations are transactional and roll back on failure.



#### 6.5.11.25 UX Design Principles

The Goal Keeper Tool SHALL render diagrams consistent with GSN Community Standard Version 3 to the maximum extent practical using the KerML 1.0 language within the SSTPA Tool current visual style.
All entities depicted in Goal Keeper SHALL use KerML 1.0  Where KerML 1.0 conflicts with the GSN Community Standard Version 3, KerML 1.0 takes precidence.


The diagram SHALL use the following visual conventions:

• (:GsnGoal) nodes SHALL be displayed as rectangles.
• (:GsnStrategy) nodes SHALL be displayed as parallelograms.
• (:GsnSolution) nodes SHALL be displayed as circles.
• (:GsnContext) nodes SHALL be displayed as rectangles with rounded sides.
• (:GsnJustification) nodes SHALL be displayed as ovals.
• (:GsnAssumption) nodes SHALL be displayed as ovals.

All GSN nodes SHALL display:

• GSN ID
• Node type label
• HID
• Name
• Statement property

Statement properties SHALL include:



• GoalStatement for (:GsnGoal)
• StrategyStatement for (:GsnStrategy)
• ContextStatement for (:GsnContext)
• JustificationStatement for (:GsnJustification)
• AssumptionStatement for (:GsnAssumption)
• SolutionStatement for (:GsnSolution)

[:SUPPORTED_BY] relationships SHALL be displayed as directed arrows with solid arrowheads.

[:IN_CONTEXT_OF] relationships SHALL be displayed as directed arrows with hollow arrowheads.



Evidence relationships from (:GsnSolution) nodes SHALL be displayed as evidence references attached to the Solution node or shown in an adjacent evidence list box.
Evidence nodes SHALL NOT be rendered inside the Solution circle.
The tool SHALL visually distinguish:



• Root Goal
• Selected node
• Hover state
• Invalid node
• Incomplete node
• Terminal Solution
• Evidence-linked Solution
• Evidence-missing Solution


#### 6.5.11.26 Model Text Panel

ModelTextLanguages: ["KERML"]. Scope: the displayed GSN structure — GSN
features, SupportedBy and InContextOf connectors, and SolutionEvidence
connectors per Section 3.7.6. Edit mode supports GSN node and relationship
mutations authorized to this tool.



\---

### 6.5.12 Use-Case Tool

6.5.12.1 Tool Purpose
The Use Case Tool allows the User to create Mission threads for the current SoI and assign (:System Function) and (:Interface) nodes to Use Cases.  Typically this is the first step in performing Critical Function/Critical Component analysis.

The Use-Case Tool is an Add-on Tool used to create, display, edit, persist, and export SysML 2 Use Case Diagrams for the current System of Interest (SoI).  Each Use Case is modeled as a (:UseCase) node owned by a (:Purpose) node through the relationship (:Purpose)-[:HAS_USECASE]->(:UseCase).  The Use-Case Tool provides the User with the means to describe how external Actors interact with the SoI through (:Interface) nodes, which (:SystemFunction) nodes realize the Use Case behavior, and which (:Requirement) nodes specify the obligations each interaction imposes.


The Use-Case Tool SHALL allow the User to:
List all (:UseCase) nodes associated with the active SoI's (:Purpose) node.
Create a new (:UseCase) node owned by the active (:Purpose).
Select an existing (:UseCase) and open it for editing and visualization.
Associate existing (:SystemFunction) and (:Interface) nodes to a (:UseCase).
Create new (:SystemFunction) and (:Interface) nodes within the active SoI and associate them to a (:UseCase).
Associate existing (:Requirement) nodes to a (:SystemFunction) or (:Interface) participating in a (:UseCase).
Create new (:Requirement) nodes and associate them to a (:SystemFunction) or (:Interface) participating in a (:UseCase).
Record external Actors as named properties of the (:UseCase) node.
Associate external Actors with the (:Interface) node(s) through which they interact with the SoI.
Graphically depict a (:UseCase) using SysML 2 Use Case Diagram conventions.
Persist all (:UseCase) data and diagram layout to the Backend as the sole source of truth such that any diagram can be fully recreated from Backend data alone.
The tool described here SHALL be branded at the top of the pop-up window as "Use-Case Tool".
The Use-Case Tool SHALL be visually and interactively consistent with the Navigator Tool, the Requirements Tool, and the State Tool.

6.5.12.2 Tool Wireframe
The Use-Case Tool window SHALL be divided into two primary regions:
Left Panel — Use Case List / Selection Panel
The left panel SHALL display the list of all (:UseCase) nodes associated with the active SoI's (:Purpose) node.
The list SHALL display for each (:UseCase):
HID
Name
ShortDescription
Number of associated (:Interface) nodes
Number of associated (:SystemFunction) nodes
Number of associated Actors
Completion indicator (see Section 6.5.12.9)
The list SHALL include a toolbar with:
"New Use Case" button — creates a new (:UseCase) node
Search / filter field — filters the list by name, HID, or Actor name
Selecting an item in the list SHALL load that (:UseCase) into the right panel.
Right Panel — Diagram Canvas and Detail Panel
The right panel SHALL contain:
A SysML 2 Use Case Diagram canvas occupying the majority of the panel.
A collapsible Use Case Detail Panel docked to the right or bottom of the canvas displaying the properties of the currently selected node.
A toolbar providing: Add Actor, Add Interface, Add Function, Add Requirement, Save, Export, Validate, and Mode selector controls.
The tool window SHALL support resize and maximize.

6.5.12.3 Invocation
The Use-Case Tool SHALL be launched from the SSTPA Control Panel "Use-Case Tool" button.
If a Data Drawer is open for a (:UseCase) node, the Use-Case Tool SHALL open in Use Case Edit Mode centered on that (:UseCase).
If a Data Drawer is open for a (:Purpose) node, the Use-Case Tool SHALL open in List Mode displaying all (:UseCase) nodes associated with that (:Purpose).
If a Data Drawer is open for a (:SystemFunction) or (:Interface) node that participates in one or more (:UseCase) nodes, the Use-Case Tool SHALL display a selection prompt listing those (:UseCase) nodes and allow the User to choose one to open.
If no valid Data Drawer context exists, the Use-Case Tool SHALL open in List Mode displaying all (:UseCase) nodes associated with the active SoI's (:Purpose).
If the active SoI has no (:UseCase) nodes, the Use-Case Tool SHALL open in List Mode with an empty list and prompt the User to create a new (:UseCase).
Opening the Use-Case Tool SHALL NOT change the current SoI.

6.5.12.4 Supported Node Context
The Use-Case Tool SHALL support invocation when the Data Drawer is open for:
(:UseCase)
(:Purpose)
(:SystemFunction) — where the Function participates in at least one (:UseCase) in the active SoI
(:Interface) — where the Interface participates in at least one (:UseCase) in the active SoI
(:System) — opens in List Mode for the active SoI
When opened, the tool SHALL:
Load the (:Purpose) node for the active SoI.
Load all (:UseCase) nodes reachable via (:Purpose)-[:HAS_USECASE]->(:UseCase) for the active SoI.
Load all (:SystemFunction) and (:Interface) nodes in the active SoI available for association.
Load all (:Requirement) nodes associated with participating (:SystemFunction) and (:Interface) nodes.
Allow the User to shift focus between Use Cases without changing the current SoI.
Provide a back action to return to the invoking context.

6.5.12.5 Modes of Operation
The Use-Case Tool SHALL support the following modes:
a. List Mode
Displays the full list of (:UseCase) nodes for the active SoI as described in Section 6.5.12.2.
Allows selection of a (:UseCase) to open in Use Case Edit Mode.
Allows creation of a new (:UseCase) via the "New Use Case" button.
Displays summary properties for each (:UseCase) in the list.
Allows search and filter of the Use Case list.
b. Use Case Edit Mode
Displays the SysML 2 Use Case Diagram for the selected (:UseCase) on the canvas.
Allows the User to add, remove, and reposition diagram elements.
Allows the User to add and associate external Actors to the (:UseCase).
Allows the User to associate existing or newly created (:Interface) nodes to the (:UseCase) and to Actors.
Allows the User to associate existing or newly created (:SystemFunction) nodes to the (:UseCase).
Allows the User to associate existing or newly created (:Requirement) nodes to participating (:SystemFunction) and (:Interface) nodes.
Allows the User to edit (:UseCase) properties through the Use Case Detail Panel.
Allows the User to edit the properties of selected (:SystemFunction), (:Interface), and (:Requirement) nodes through the Detail Panel.
Stages all edits prior to Commit per the standard SSTPA staged editing model.
c. Validation Mode
Displays structural completeness and rule violation findings for the selected (:UseCase).
Identifies (:UseCase) nodes with no associated (:Interface) or (:SystemFunction).
Identifies Actors not associated with any (:Interface).
Identifies (:SystemFunction) and (:Interface) nodes with no associated (:Requirement).
Identifies missing mandatory (:UseCase) properties.
Identifies diagram layout inconsistencies between persisted diagram JSON and current Backend graph state.
Provides actionable remediation messages for each finding.
d. Export / Presentation Mode
Provides a clean report-oriented rendering of the Use Case Diagram.
Preserves SysML 2 shapes, labels, Actor figures, system boundary, relationship notation, and <<extend>> / <<include>> annotations where present.
Allows the User to export the current viewport or the full diagram.





#### 6.5.12.6 (:UseCase) Node Definition



(:UseCase) is a Core Data Model node type defined in Section 3.3.10.33  The requirements in this section govern its use within the Use-Case Tool.  In the event of conflict between this section and Section 3.3, Section 3.3 is authoritative.

Relationship to the Core Data Model:
(:Purpose)-[:HAS_USECASE]->(:UseCase)
(:UseCase)-[:INCLUDES]->(:SystemFunction)
(:UseCase)-[:INVOLVES]->(:Interface)
A (:UseCase) SHALL be owned by exactly one (:Purpose) node.
A (:Purpose) MAY have zero or more (:UseCase) nodes.
A (:UseCase) MAY be associated with zero or more (:SystemFunction) nodes via [:INCLUDES].
A (:UseCase) MAY be associated with zero or more (:Interface) nodes via [:INVOLVES].
(:SystemFunction) and (:Interface) nodes associated with a (:UseCase) SHALL already belong to the active SoI (i.e., be reachable via (:System)-[:HAS_FUNCTION]->(:SystemFunction) and (:System)-[:HAS_INTERFACE]->(:Interface) respectively) or SHALL be newly created within the active SoI as part of the Use-Case Tool session.
The Use-Case Tool SHALL NOT create (:SystemFunction) or (:Interface) nodes that belong to a SoI other than the active SoI.
HID Prefix:  UC
The (:UseCase) SHALL receive a HID of the form UC_<Index>_<SequenceNumber> consistent with the HID rules in Section 3.3.8.



##### 6.5.12.7 (:UseCase) Node Properties



The (:UseCase) node SHALL carry the common properties defined in Section 1.3.7 and the following type-specific properties.
All properties SHALL be sufficient to fully reconstruct the SysML 2 Use Case Diagram without reference to any external file.  The Backend SHALL be the sole source of truth.
Identity and Description:
Property	Label	Type	Edit	Default
Name	"Name:"	String	edit	"Null"
ShortDescription	"Short Description:"	String	edit	"Null"
Description	"Description:"	String (long)	edit	"Null"
UCStatement	"Use Case Statement:"	String	edit	"Null"
Precondition	"Precondition:"	String	edit	"Null"
Postcondition	"Postcondition:"	String	edit	"Null"
NormalFlow	"Normal Flow:"	String (long)	edit	"Null"
AlternateFlows	"Alternate Flows:"	String (long)	edit	"Null"
ExceptionFlows	"Exception Flows:"	String (long)	edit	"Null"
Actors:
External Actors shall be stored as structured JSON on the (:UseCase) node.  Each Actor entry SHALL contain:
Field	Description
ActorID	Unique identifier within the (:UseCase); short string, e.g. "A1"
ActorName	Human-readable name of the external Actor
ActorType	Enum: {Human, System, ExternalSystem, Device, Organization}
ActorDescription	Free-text description of the Actor's role
InterfaceHIDs	Array of HID strings of (:Interface) nodes through which this Actor interacts
The Actor list SHALL be stored in the property:
ActorList "Actors:" JSON Array edit default: "[]"
Diagram Persistence:
UseCaseDiagramJSON "Diagram Source:" serialized JSON document fixed default: N/A
The UseCaseDiagramJSON property SHALL store sufficient information to reproduce the full SysML 2 diagram including:
Schema version
(:UseCase) HID and uuid
System boundary label and dimensions
Actor positions and display labels
(:Interface) node positions, HID references, and display labels
(:SystemFunction) node positions, HID references, and display labels
Relationship types and directionality between diagram elements
<<extend>>, <<include>>, and generalization relationship annotations where present
Viewport and zoom state at last save
Layout version timestamp
Analytical State:
Property	Label	Type	Edit	Default
IsComplete	"Complete:"	Boolean	fixed	False
ValidationStatus	"Validation Status:"	Enum {NotValidated, Valid, Invalid, Warning}	fixed	NotValidated
Priority	"Priority:"	Integer	edit	Null
Rationale	"Rationale:"	String	edit	"Null"

6.5.12.8 Relationship Semantics
The Use-Case Tool SHALL create and manage the following relationships:
Ownership:
(:Purpose)-[:HAS_USECASE]->(:UseCase)
This relationship is created when a new (:UseCase) is created.  The owning (:Purpose) SHALL be the (:Purpose) node of the active SoI.  This relationship SHALL NOT be removable through the Use-Case Tool; deletion of the (:UseCase) node SHALL remove the relationship.
Function Participation:
(:UseCase)-[:INCLUDES]->(:SystemFunction)
This relationship indicates that the (:SystemFunction) is performed as part of realizing the (:UseCase).  A (:UseCase) MAY have zero or more [:INCLUDES] relationships.  A (:SystemFunction) MAY participate in multiple (:UseCase) nodes.
Interface Participation:
(:UseCase)-[:INVOLVES]->(:Interface)
This relationship indicates that the (:Interface) is the boundary through which an Actor or connected system interacts with the SoI to participate in the (:UseCase).  A (:UseCase) MAY have zero or more [:INVOLVES] relationships.  An (:Interface) MAY participate in multiple (:UseCase) nodes.
Requirement Association (through (:SystemFunction) and (:Interface)):
(:SystemFunction)-[:HAS_REQUIREMENT]->(:Requirement)
(:Interface)-[:HAS_REQUIREMENT]->(:Requirement)
The Use-Case Tool SHALL create (:Requirement) nodes and associate them using the existing canonical [:HAS_REQUIREMENT] relationship as defined in Section 3.3.4.8.  The Use-Case Tool SHALL NOT create a direct (:UseCase)-[:HAS_REQUIREMENT]->(:Requirement) relationship.  All (:Requirement) nodes created or associated through the Use-Case Tool SHALL be owned by the (:SystemFunction) or (:Interface) to which they are allocated.
Extension and Inclusion (Optional SysML Semantics):
(:UseCase)-[:EXTENDS]->(:UseCase)
(:UseCase)-[:INCLUDES_UC]->(:UseCase)
These relationships model the SysML <<extend>> and <<include>> dependency relationships between (:UseCase) nodes within the same SoI.  Both are optional.  [:INCLUDES_UC] is used instead of [:INCLUDES] to avoid naming conflict with the Function participation relationship.
The Backend SHALL prevent duplicate logical relationships between the same source node, target node, and relationship type.
The Backend SHALL reject any [:EXTENDS] or [:INCLUDES_UC] relationship that creates a cycle.

6.5.12.9 Use Case Completeness Rules
A (:UseCase) SHALL be considered structurally complete when all of the following conditions are satisfied:
The (:UseCase) has a non-null Name and UCStatement.
The (:UseCase) has at least one Actor entry in ActorList.
Every Actor entry has at least one InterfaceHID referencing an (:Interface) associated via [:INVOLVES].
The (:UseCase) has at least one [:INCLUDES]->(:SystemFunction) relationship.
The (:UseCase) has at least one [:INVOLVES]->(:Interface) relationship.
Every associated (:SystemFunction) has at least one [:HAS_REQUIREMENT]->(:Requirement) relationship.
Every associated (:Interface) has at least one [:HAS_REQUIREMENT]->(:Requirement) relationship.
Precondition and Postcondition properties are non-null.
NormalFlow property is non-null.
The IsComplete property SHALL be set to True only when all completeness conditions above are satisfied.  IsComplete SHALL be a computed fixed property updated on each Commit.
The Use-Case Tool SHALL display a visual completeness indicator per (:UseCase) in List Mode.
The Use-Case Tool SHALL display per-condition completeness status in Validation Mode.



## 6.5.12.10 SysML 2 Visualization Requirements

The Use-Case Tool SHALL render Use Case Diagrams consistent with SysML 2 Use Case Diagram conventions to the maximum extent practical within the SSTPA Tool visual style.
The diagram SHALL include:
A system boundary rectangle labeled with the SoI (:System) Name.
External Actor figures rendered as stick figures (human) or box figures (non-human) positioned outside the system boundary.
Actor labels displaying ActorName below the Actor figure.
(:UseCase) nodes rendered as named ovals inside the system boundary.
(:Interface) nodes rendered as named rectangles on or adjacent to the system boundary, representing the point of interaction.
(:SystemFunction) nodes rendered as named rectangles inside the system boundary.
Association lines from each Actor to the (:Interface) node(s) through which it interacts.
Association lines from (:Interface) nodes to the (:UseCase) oval(s) they support.
Association lines from (:UseCase) ovals to (:SystemFunction) node(s) they include.
«include» annotations on dashed arrows for [:INCLUDES_UC] relationships,
per SysML 2.0 include use case.
«extend» annotations on dashed arrows for [:EXTENDS] relationships. SysML
2.0 defines no extend relationship; this adornment is an SSTPA display
convention for the #extend-annotated specialization defined in Section
3.7.6. Exported text SHALL contain the standard form, not an extend
keyword.

(:Requirement) nodes SHALL be displayed as optional overlays or in the Detail Panel; they SHALL NOT clutter the primary canvas unless the User enables the Requirements Overlay toggle.
The diagram SHALL use:
Directed edges for <<extend>> and <<include>> relationships.
Undirected association lines for Actor-Interface-UseCase connections.
Shape and color only for node-type distinction; no icons within the diagram.
SysML 2.0 keyword annotations in guillemets (« ») for <<extend>>, <<include>>, and Actor stereotypes.
The diagram canvas SHALL support user-adjustable positioning of all diagram elements.  Layout SHALL be persisted in UseCaseDiagramJSON on Commit.



6.5.12.11 Visual Encoding Requirements
The Use-Case Tool SHALL follow the same visual encoding rules established for the Navigator Tool unless SysML 2.0 convention is authoritative within the diagram.
The tool SHALL visually distinguish the following node types:
(:UseCase) — oval, inside system boundary
(:SystemFunction) — rectangle, inside system boundary
(:Interface) — rectangle, on or straddling the system boundary
Actor (Human) — stick figure, outside system boundary
Actor (Non-Human) — labeled box with «stereotype», outside system boundary
(:Requirement) — displayed only as overlay when Requirements Overlay is enabled; rendered as SysML requirement box
The following states SHALL be visually distinct:
Selected node
Hover state
Incomplete node (IsComplete = False)
Invalid node (ValidationStatus = Invalid)
Warning node (ValidationStatus = Warning)
New (unsaved / staged) node
(:UseCase) with no Actors
(:UseCase) with no (:SystemFunction) associations
(:UseCase) with no (:Interface) associations
Visual distinction SHALL be achieved using non-icon methods including: border style, border thickness, fill color, label treatment, glow or highlight state.



6.5.12.12 Interaction Requirements
The diagram canvas SHALL support:
Zoom (mouse wheel and controls)
Pan (drag on canvas background)
Node selection (single click)
Multi-node selection (Ctrl+click or rubber-band selection)
Node drag to reposition
Relationship selection (single click on edge)
Hover highlighting of connected elements
Animated centering on selected node
Expand / collapse of Requirements Overlay
Keyboard navigation
Escape to deselect / close Detail Panel
Selecting a (:UseCase) node SHALL:
Highlight the node and all directly associated elements.
Display its properties in the Use Case Detail Panel.
Display the list of associated Actors, (:Interface) nodes, (:SystemFunction) nodes, and (:Requirement) counts in the Detail Panel.
Selecting an (:Interface) node SHALL:
Highlight the node and all (:UseCase) nodes it participates in.
Display its properties and Actor associations in the Detail Panel.
Selecting an Actor SHALL:
Highlight the Actor and all (:Interface) nodes with which it is associated.
Display the Actor's entry from ActorList in the Detail Panel for editing.
Selecting a (:SystemFunction) node SHALL:
Highlight the node and all (:UseCase) nodes that include it.
Display its properties in the Detail Panel.
Right-clicking on a (:UseCase), (:Interface), or (:SystemFunction) node SHALL display a context menu with options appropriate to that node type including: Edit Properties, Add Requirement, Associate Existing Node, Remove Association, and Delete Node (with confirmation).



#### 6.5.12.13 Actor Management



The Use-Case Tool SHALL allow the User to add, edit, and remove Actors on the (:UseCase) node.
Actor addition SHALL:
Prompt the User for ActorName, ActorType, and ActorDescription.
Assign a unique ActorID within the (:UseCase).
Add an Actor figure to the diagram canvas outside the system boundary.
Stage the ActorList property update for Commit.
The User SHALL be able to associate an Actor with one or more (:Interface) nodes by drawing an association line from the Actor figure to the (:Interface) node on the canvas, or by selecting the Actor in the Detail Panel and adding the (:Interface) HID to the InterfaceHIDs field.
Actor removal SHALL:
Remove the Actor entry from ActorList.
Remove all Actor-to-Interface association lines.
Stage the update for Commit.
NOT delete the (:Interface) nodes with which the Actor was associated.
The tool SHALL warn the User if removing an Actor results in an (:Interface) node that has no remaining Actor association.



6.5.12.14 Node Creation and Editing

\---

(:UseCase) Creation:
The Use-Case Tool SHALL allow the User to create a new (:UseCase) node within the current SoI.
Creation SHALL:
Use the standard SSTPA staged editing and Commit confirmation model.
Assign valid HID and uuid values per Section 3.3.8.
Assign Owner, Creator, and LastTouch per Section 1.3.7.1.
Assign the node to the active SoI through (:Purpose)-[:HAS_USECASE]->(:UseCase).
Open the created (:UseCase) in the canvas in Use Case Edit Mode.
Initialize IsComplete to False and ValidationStatus to NotValidated.
Initialize UseCaseDiagramJSON with an empty diagram scaffold including the system boundary labeled with the active SoI (:System) Name.
(:SystemFunction) Creation:
The Use-Case Tool MAY allow the User to create a new (:SystemFunction) node within the active SoI.
Creation SHALL:
Follow the standard SSTPA staged editing and Commit model.
Assign valid HID, uuid, and common properties.
Relate the new (:SystemFunction) to the active SoI via (:System)-[:HAS_FUNCTION]->(:SystemFunction).
Immediately create a (:UseCase)-[:INCLUDES]->(:SystemFunction) relationship to the current (:UseCase).
(:Interface) Creation:
The Use-Case Tool MAY allow the User to create a new (:Interface) node within the active SoI.
Creation SHALL:
Follow the standard SSTPA staged editing and Commit model.
Assign valid HID, uuid, and common properties.
Relate the new (:Interface) to the active SoI via (:System)-[:HAS_INTERFACE]->(:Interface).
Immediately create a (:UseCase)-[:INVOLVES]->(:Interface) relationship to the current (:UseCase).
(:Requirement) Creation:
The Use-Case Tool MAY allow the User to create a new (:Requirement) node and associate it with a (:SystemFunction) or (:Interface) participating in the current (:UseCase).
Creation SHALL:
Follow the standard SSTPA staged editing and Commit model.
Assign valid HID, uuid, and common properties per Section 3.3.8.
Relate the new (:Requirement) to the owning (:SystemFunction) or (:Interface) via [:HAS_REQUIREMENT].
Initialize Orphan = True and Barren = True per Section 3.3.8.13.
NOT create a direct relationship between the (:UseCase) and the (:Requirement).
Associating Existing Nodes:
The User SHALL be able to associate existing (:SystemFunction), (:Interface), or (:Requirement) nodes from the active SoI to the current (:UseCase) or its participating nodes.
The tool SHALL present a searchable selector pre-filtered to nodes within the active SoI.



6.5.12.15 Diagram Persistence Requirements
All Use Case Diagram data SHALL be stored in the Backend.  No diagram state SHALL exist only in the Frontend.
The UseCaseDiagramJSON property on the (:UseCase) node SHALL be the canonical persistence record for diagram layout and visual configuration.
UseCaseDiagramJSON SHALL be updated on every successful Commit of diagram layout changes.
UseCaseDiagramJSON SHALL NOT override semantic node and relationship data.  The graph relationships stored in the Backend are the semantic source of truth.  UseCaseDiagramJSON stores only visual/layout information (positions, viewport, display settings).
On opening a (:UseCase), the tool SHALL:
Retrieve the current semantic graph (nodes and relationships) from the Backend.
Retrieve the UseCaseDiagramJSON for layout and visual state.
Reconcile the two: render all semantically present nodes and relationships, using stored positions where available and auto-layout for newly added elements not yet in the JSON.
If reconciliation reveals stale references (nodes in JSON no longer in graph), silently ignore the stale entries and notify the User that layout was partially regenerated.



#### 6.5.12.16 Data Drawer Integration



The Use-Case Tool SHALL integrate with the standard SSTPA Data Drawer.
Selecting any node in the Use-Case Tool canvas SHALL populate the Data Drawer with that node's properties if a Data Drawer is open.
The Use-Case Tool SHALL allow the User to open a Data Drawer directly from the Use Case Detail Panel for any selected node.
Edits committed from the Data Drawer to a node participating in a (:UseCase) SHALL be reflected in the Use-Case Tool canvas on the next canvas refresh or immediate refresh if the tool is open.



#### 6.5.12.17 Validation Requirements



The Use-Case Tool SHALL validate the following rules before allowing Commit:
(:UseCase) HID and uuid are assigned and non-null.
The (:UseCase) is associated with exactly one (:Purpose) node via [:HAS].
All Actor InterfaceHIDs reference (:Interface) nodes that are actually associated to the (:UseCase) via [:INVOLVES].
No [:EXTENDS] or [:INCLUDES_UC] cycle exists among (:UseCase) nodes.
No duplicate logical relationships exist between the same source, target, and relationship type.
Newly created (:SystemFunction) and (:Interface) nodes belong to the active SoI.
Newly created (:Requirement) nodes are associated to a (:SystemFunction) or (:Interface) via [:HAS_REQUIREMENT] and not directly to the (:UseCase).
The tool SHALL display a warning (non-blocking) when completeness conditions in Section 6.5.12.9 are not met.
The tool SHALL display an error (blocking) when any hard validation rule above is violated.
Error display SHALL include: rule violated, affected node or relationship, and recommended corrective action where practical.



#### 6.5.12.18 Export Requirements



The Use-Case Tool SHALL support export of Use Case Diagrams.
Supported export formats SHALL include:
PNG
SVG
JSON (full diagram data per UseCaseDiagramJSON schema)
Markdown summary
PNG and SVG exports SHALL preserve:
System boundary rectangle and SoI label
Actor figures and labels
(:UseCase) ovals and labels
(:Interface) and (:SystemFunction) rectangles and labels
All association lines and dependency arrows
SysML keyword annotations
Completion and validation state markers if enabled
The JSON export SHALL include:
Schema version
(:UseCase) HID and uuid
SoI (:System) HID and Name
Actor list (all Actor entries from ActorList)
(:Interface) node HIDs, Names, and positions
(:SystemFunction) node HIDs, Names, and positions
All diagram relationships and their types
Viewport and display settings
The Markdown summary SHALL include:
Use Case name, HID, and UCStatement
Precondition, Postcondition, NormalFlow
Actor table (ActorName, ActorType, associated Interface HIDs and Names)
(:Interface) table (HID, Name, associated Actors, associated Requirement HIDs)
(:SystemFunction) table (HID, Name, associated Requirement HIDs)
Completion status
The User SHALL be able to export:
The current viewport.
The full Use Case Diagram regardless of viewport.
The Markdown summary for the selected (:UseCase).
A full report of all (:UseCase) nodes in the active SoI as a Markdown document.
Exports SHALL be suitable for insertion into System Description, System Specification, and certification package reports.



#### 6.5.12.19 Search and Navigation



The Use-Case Tool SHALL provide search and navigation within the active SoI's Use Case data.
The List Mode search field SHALL filter (:UseCase) nodes by:
Name (substring match)
HID (exact and prefix match)
Actor name (substring match)
Associated (:Interface) HID or Name
Associated (:SystemFunction) HID or Name
Selecting a search result SHALL navigate the canvas to center on the relevant (:UseCase) or element.
The tool SHALL provide a Previous / Next navigation control to step through search results.



#### 6.5.12.20 Backend Integration Requirements



The Use-Case Tool SHALL retrieve and mutate data through the Backend API.
Required Backend capabilities include:
Retrieval of all (:UseCase) nodes for the active SoI via (:Purpose)-[:HAS_USECASE]->(:UseCase).
Retrieval of complete (:UseCase) properties including ActorList JSON and UseCaseDiagramJSON.
Retrieval of all [:INCLUDES]->(:SystemFunction) and [:INVOLVES]->(:Interface) relationships for a (:UseCase).
Retrieval of all (:SystemFunction) and (:Interface) nodes in the active SoI for the association selector.
Retrieval of all [:HAS_REQUIREMENT]->(:Requirement) relationships for participating nodes.
Validation of (:UseCase) relationship creation against Core Data Model rules.
Validation of [:EXTENDS] and [:INCLUDES_UC] acyclicity.
Transactional creation, update, and deletion of (:UseCase) nodes.
Transactional creation and deletion of [:HAS], [:INCLUDES], [:INVOLVES], [:EXTENDS], and [:INCLUDES_UC] relationships.
Transactional creation of (:SystemFunction), (:Interface), and (:Requirement) nodes and their SoI membership relationships.
Transactional persistence of UseCaseDiagramJSON.
Computation and update of IsComplete and ValidationStatus on Commit.
Export data retrieval.
All Use-Case Tool write operations SHALL be ACID compliant.
All semantic graph mutations and diagram persistence updates SHALL commit as a single transaction unless explicitly separated by User confirmation.



#### 6.5.12.21 Error Handling



If a Commit validation fails, the Use-Case Tool SHALL display:
Failure status.
Specific rule violated.
Affected node or relationship.
Recommended corrective action where practical.
No partial Use Case mutation SHALL be committed.
If UseCaseDiagramJSON cannot be reconciled with the current semantic graph, the tool SHALL:
Open the valid portion of the diagram.
Auto-layout elements not covered by the stored JSON.
Notify the User that layout was partially regenerated.
Allow the User to save the repaired layout via a Commit of layout changes only.
If a referenced (:SystemFunction), (:Interface), or (:Requirement) node has been deleted from the Backend since the diagram was last opened, the tool SHALL:
Remove the stale node from the canvas.
Mark the (:UseCase) ValidationStatus as Warning.
Notify the User of the missing node and its former HID.



#### 6.5.12.22 Reporting and Certification Package Support



The Use-Case Tool SHALL support System Description and certification package workflows.
The tool SHALL allow Users to:
Export individual Use Case Diagrams in publication-ready format.
Generate a summary of all (:UseCase) nodes in the active SoI.
Identify incomplete (:UseCase) nodes and missing associations.
Identify (:Interface) and (:SystemFunction) nodes that participate in no (:UseCase).
Identify Actors with no (:Interface) associations.
Preserve reproducible diagram states for reports.
The Use-Case Tool SHALL support generation of Use Case Diagrams suitable for inclusion in System Description reports produced by the Reports Tool (Section 6.5.3).

6.5.12.23 Performance Requirements
The Use-Case Tool SHALL:
Load the full list of (:UseCase) nodes for the active SoI in under 2 seconds for SoIs with up to 100 Use Cases.
Load a single (:UseCase) diagram, including all associated nodes and relationships, in under 3 seconds.
Maintain UI responsiveness during layout, editing, validation, and export operations.
Use bounded traversal for all graph queries.
Prevent unbounded recursive graph expansion.
Support progressive loading of large Use Case sets.
Exact HID and uuid lookup SHALL be faster than general text search.



#### 6.5.12.24 Test and Verification Requirements



The Use-Case Tool SHALL be verified through test and analysis.
The system SHALL verify that:
(:UseCase) nodes are created with valid HID, uuid, and common property defaults.
A new (:UseCase) is correctly associated to the active SoI (:Purpose) via [:HAS].
List Mode displays all and only (:UseCase) nodes associated with the active SoI's (:Purpose).
Use Case Edit Mode opens the correct (:UseCase) from list selection.
Use Case Edit Mode opens the correct (:UseCase) from Data Drawer context.
Actors can be added, edited, and removed; ActorList JSON is correctly maintained.
Actor-to-Interface associations are correctly stored in InterfaceHIDs and reflected as canvas association lines.
(:SystemFunction) and (:Interface) nodes are correctly created within the active SoI and associated to the (:UseCase).
(:Requirement) nodes are correctly created and associated to (:SystemFunction) and (:Interface) via [:HAS_REQUIREMENT], not directly to (:UseCase).
[:INCLUDES], [:INVOLVES], [:EXTENDS], and [:INCLUDES_UC] relationships are correctly created and deleted.
Cycle detection correctly rejects [:EXTENDS] and [:INCLUDES_UC] relationships that would create a cycle.
Duplicate logical relationship detection correctly rejects duplicates.
IsComplete is computed correctly and updates on Commit.
ValidationStatus is computed correctly and updates on Commit.
UseCaseDiagramJSON persists and reloads correctly.
Stale diagram references are handled gracefully without loss of semantic data.
Exports preserve the full SysML 2 visual representation.
All write operations are transactional and roll back on failure.
Opening the tool does not change the current SoI.
Nodes outside the active SoI are not available for creation through the tool.



#### 6.5.12.25 UX Design Principles



The Use-Case Tool SHALL render Use Case Diagrams consistent with SysML 2 Use Case Diagram conventions to the maximum extent practical within the SSTPA Tool visual style.
The diagram SHALL use the following visual conventions:
System boundary SHALL be a labeled rectangle containing all (:UseCase), (:SystemFunction), and (:Interface) elements.
The system boundary label SHALL display the active SoI (:System) Name.
(:UseCase) nodes SHALL be displayed as ovals.
(:Interface) nodes SHALL be displayed as rectangles positioned on or adjacent to the system boundary, visually indicating their role as a boundary-crossing point.
(:SystemFunction) nodes SHALL be displayed as rectangles inside the system boundary.
Human Actors SHALL be displayed as stick figures.
Non-Human Actors (System, ExternalSystem, Device, Organization) SHALL be displayed as labeled boxes with the ActorType shown as a «stereotype».
Association lines SHALL be undirected solid lines.
<<extend>> relationships SHALL be displayed as dashed arrows pointing from the extending (:UseCase) to the extended (:UseCase), annotated «extend».
<<include>> relationships SHALL be displayed as dashed arrows pointing from the base (:UseCase) to the included (:UseCase), annotated «include».
All (:UseCase) ovals SHALL display:
HID
Name
All (:Interface) and (:SystemFunction) rectangles SHALL display:
HID
Name
Actor figures SHALL display:
ActorName
The Use-Case Tool canvas SHALL provide a toggleable Requirements Overlay that, when enabled, displays associated (:Requirement) nodes as SysML-style requirement boxes linked to their owning (:Interface) or (:SystemFunction).
The tool SHALL provide a Legend identifying all node shapes, Actor figures, line styles, and annotations used.
The tool SHALL use clear, uncluttered layout defaults, with the system boundary centered on the canvas, Actors distributed around the exterior, and Use Cases, Interfaces, and Functions arranged with adequate spacing to support readability at typical screen resolutions.


#### 6.5.12.26 Model Text Panel

ModelTextLanguages: ["SYSML"]. Scope: the selected (:UseCase) and its
associations — use case usage with actor parameters, perform members,
include use case relationships, and #extend-annotated specializations per
Section 3.7.6. Edit mode supports (:UseCase) properties and [:INCLUDES],
[:INVOLVES], [:INCLUDES_UC], [:EXTENDS] mutations.




\---

### 6.5.13 Connection Tool

#### 6.5.13.1  Tool Purpose
The Connection Tool is intended as a graphical display of connections across the project.  The User will use the Connection Tool to create and visualize (:Connection) nodes depicted as connections between Systems through each System's Interface.  Assign ownership to (:System) nodes and relating (:Interface) nodes as participants.  The Connection Tool will allow the User to filter connections from "All" to a single connection.  It will allow filtering on System Tiers, and relevant Connection properties.  It will also allow the User to filter on the (:Connection) node's OSI_level property. The Connection Tool will allow the User to specify (relate requirements to) Connections and add properties.


#### 6.5.13.2  Tool Wireframe



#### 6.5.13.3  Invocation



#### 6.5.13.4  Supported Node Context
If the User has the data drawer open on a Connection, that connection will be displayed in the Connection Tool.
If a User has the Data Drawer open on an Interface, all Connections where that interface participates will be displayed.


#### 6.5.13.5  Modes of Operation
The Connection Tool SHALL have three modes of operation
1.  Selection Mode:  User selects a connection from a list of all connections organized by Tier and System.  User may hilight and select multiple connections.
2.  Filtering Mode:  User displays Connections on the Canvas based on user selected criterial
3.  Display Mode:  User views Connections on the Canvas and is able to create and/or Assign Interface nodes.  User may create a new Conection and assign owner ship.  User may reassign owner ship of existing connectins.

#### 6.5.13.6  Performance Requirements



#### 6.5.13.7  Test and Verification Requirements



#### 6.5.13.8  UX Design Principles



#### 6.5.13.9 Model Text Panel
ModelTextLanguages: ["SYSML"]. Scope: the selected (:Connection) — the
connection usage, its port ends, and attributes per Section 3.7.5/3.7.6.
\---



### 6.5.14 Message Center

The Frontend shall Integrate Message Center in the same manner as other Add-on Tools excepting its position and unique icon and display in the Branding Panel.
The Branding Panel SHALL display a mail icon labeled or tooltiped as Message Center.
The Message Center SHALL display an unread indicator when unread messages exist.
Selecting the Message Center icon SHALL open a pop-up window.

The Message Center pop-up SHALL display the current user’s mailbox only.

The Message Center pop-up SHALL not change the current SoI.



#### 6.5.14.1 Purpose

The Message Center provides the current user access to direct messages and owner-change notification messages.
The Message Center allows the current user to send direct messages to other users and the Admin.

The Message Center manifest SHALL declare ModelTextLanguages:  Messaging
data is User Data, outside the Engineering Translation Set (Section 3.7.2);
the Message Center has no Model Text Panel.


#### 6.5.14.2  Tool Wireframe



#### 6.5.14.3  Invocation



#### 6.5.14.4  Supported Node Context



#### 6.5.14.5  Modes of Operation





##### 6.5.14.6 Window behavior

The Message Center SHALL open in a pop-up window.

The pop-up SHALL be closable without affecting staged edits in the Data Drawer.

The pop-up SHALL support refresh.

The pop-up SHALL preserve the current SoI and current GUI navigation state.





##### 6.5.14.7 Mailbox list view

The message list SHALL display columns:
Subject
DateTime
HID
Sender
Message Type
Read/Unread



The list SHALL support:

sort by clicking column headers

reverse sort by repeated click

row selection

keyboard navigation

unread highlighting





##### 6.5.14.8 Message open behavior



Clicking the message row or row icon SHALL open the message detail view.

The detail view SHALL display:

subject

sender

sent datetime

related HID or HIDs

full message body



The detail view SHALL support:

Reply

Delete

Close



##### 6.5.14.9 Direct messaging

Users SHALL be able to send direct messages to other users.

Direct messages SHALL be stored in the recipient mailbox.

Direct messages MAY optionally reference one or more HIDs.



##### 6.5.14.10 Change notification messages

The system SHALL generate change notification messages automatically on commit when required by ownership rules.

Sender SHALL be the current user who committed the change.

Recipient SHALL be the Owner of the affected node.

The HID column SHALL show the primary affected HID; where multiple HIDs are affected, the detail view SHALL show the full list.



##### 6.5.14.11 Delete behavior

Delete in the current version SHOULD be soft delete.

Deleting a message from a mailbox SHALL remove it from the current user’s active list only.

Deleted messages SHOULD remain recoverable for audit unless system retention rules later remove them.



##### 6.5.14.12 Read state

Opening a message SHALL mark it read unless the user closes before content load completes.

Unread count SHALL update after read and delete actions.



#### 6.5.14.13  Performance Requirements



#### 6.5.14.14  Test and Verification Requirements



#### 6.5.14.15  UX Design Principles



### 6.5.15 Admin Tool

The Admin Tool SHALL operate only through Backend API endpoints.
The Admin Tool SHALL NOT directly access the Neo4j database.
The Admin Tool SHALL comply with the staged edit and Commit model used throughout SSTPA Tools.
The Admin Tool SHALL use the shared Add-on Tool shell and styling conventions.



#### 6.5.15.1 Tool Purpose



The Admin Tool is an Add-on Tool that allows users with `UserRole = ADMIN` or `UserRole = ROOT_ADMIN` (collectively referred to as Admin users in this section) to perform all account management and data stewardship functions required to operate and maintain the SSTPA Tools installation.
The Admin Tool provides a graphical interface for managing the population of registered accounts, managing message data when accounts are disestablished, and performing global data ownership transfers necessary to preserve Core Data integrity when a User leaves the project.
The Admin Tool SHALL be accessible only to users authenticated with `UserRole = ADMIN` or `UserRole = ROOT_ADMIN`.  An authenticated (:User) with `UserRole = USER` SHALL NOT be able to open, invoke, or use the Admin Tool.  The Backend SHALL enforce this access restriction on every API call made by the Admin Tool.
The tool described here SHALL be branded at the top of the pop-up window as "Admin Tool".
The Admin Tool SHALL allow Admin users to:
View the full list of registered (:User) accounts including all roles.
Create new USER accounts.
Create new ADMIN accounts (requires an existing ADMIN or ROOT_ADMIN to authorize).
Edit non-critical properties of any (:User) account (Name, Email, DisplayName).
Suspend and reinstate USER accounts.
Disenroll (remove) a USER account, including ownership transfer and message disposition.
Suspend and reinstate ADMIN accounts.
Disenroll (remove) an ADMIN account, subject to ROOT_ADMIN authorization.
View all (:Mailbox) and (:Message) records for any (:User) account.
Transfer ownership of messages from a disenrolled or suspended User to another active User.
Delete messages from any User mailbox (soft delete).
Perform a global ownership transfer of all Core Data owned by User A to User B.
Manage (:Sandbox) nodes owned by a disenrolled User (transfer or delete).
View Backend connection status and telemetry summary.
Reset the Root Admin password (ROOT_ADMIN only).
The Admin Tool SHALL NOT allow any Admin user to:
Create, edit, or delete Core Data nodes or relationships except through the global ownership transfer function.
Create a second ROOT_ADMIN account.
Delete or demote the ROOT_ADMIN account (this action is prohibited absolutely).
Access or modify Reference Data.
The ROOT_ADMIN account established at installation SHALL be permanent and SHALL NOT be deletable or demotable by any operation within the Admin Tool.

The Admin Tool manifest SHALL declare ModelTextLanguages: []. User and
Product data are outside the Engineering Translation Set (Section 3.7.2);
the Admin Tool has no Model Text Panel.


#### 6.5.15.2 Tool Wireframe



The Admin Tool window SHALL be divided into three primary regions:

Top Bar — Title and Backend Status Strip
The top bar SHALL display:
"Admin Tool" branding label.
Currently authenticated Admin user name and role badge (ADMIN or ROOT_ADMIN).
Backend connection status indicator (Connected / Disconnected, IP:Port).
A Refresh button.

Left Panel — Function Navigation
The left panel SHALL display a vertical navigation list of functional areas:
Account Management (selected by default on open)
Message Management
Ownership Transfer
Sandbox Management
Backend Status
Selecting a function SHALL load the corresponding view into the right panel.

Right Panel — Work Area
The right panel SHALL display the active functional view as specified per mode in Section 6.5.15.5.
The Admin Tool window SHALL support resize and maximize.
The Admin Tool SHALL open as a modal window.  The main GUI SHALL remain visible but inactive while the Admin Tool is open.  The current SoI SHALL NOT change when the Admin Tool is opened or closed.



#### 6.5.15.3 Invocation



The Admin Tool SHALL be accessible only when the authenticated session has `UserRole = ADMIN` or `UserRole = ROOT_ADMIN`.
The Admin Tool SHALL be launched from the SSTPA Control Panel "Admin Tool" button.
The Admin Tool button SHALL be visible in the Control Panel only when the current authenticated user has `UserRole = ADMIN` or `UserRole = ROOT_ADMIN`.  The button SHALL NOT be displayed to users with `UserRole = USER`.
The Admin Tool SHALL open in Account Management mode by default.
Opening the Admin Tool SHALL NOT change the current SoI.
Opening the Admin Tool SHALL NOT disrupt any staged edits in the main GUI Data Drawer.
The Admin Tool SHALL verify its own session authorization with the Backend on every open.  If the Backend reports that the current session user does not hold a qualifying UserRole, the Admin Tool SHALL refuse to open and SHALL display an authorization error.

6.5.15.4 Supported Node Context

The Admin Tool operates on Tool Data Model nodes, not Core Data Model nodes.
The Admin Tool SHALL operate on:
(:User) nodes (all roles)
(:Mailbox) nodes
(:Message) nodes
(:Sandbox) nodes (for transfer and deletion during disenrollment)
The Admin Tool SHALL read, but SHALL NOT modify, Core Data nodes except through the global ownership transfer function defined in Section 6.5.15.6, which modifies only the Owner and OwnerEmail properties on Core Data nodes.
The Admin Tool has no dependency on the current SoI and SHALL NOT use SoI context for any operation.



#### 6.5.15.5 Modes of Operation



The Admin Tool SHALL support the following modes, each loaded in the right panel when the corresponding navigation item is selected:
a. Account Management Mode
Account Management Mode is the default mode on open.
The mode SHALL display a tabbed or filterable account roster containing all registered (:User) nodes.
The roster SHALL display for each account:
Display Name
UserName
UserEmail
UserRole badge (USER, ADMIN, ROOT_ADMIN)
AccountStatus (ACTIVE, SUSPENDED, DISENROLLED)
Created date
LastTouch date
Number of Core Data nodes owned (read-only computed count)
Number of unread messages
The roster SHALL support:
Sort by any column (click header; second click reverses)
Filter by UserRole and AccountStatus
Search by name or email (substring match)
Selecting an account row SHALL load the Account Detail Panel for that account (see Section 6.5.15.7).
A toolbar above the roster SHALL provide:
"New User Account" button
"New Admin Account" button (ADMIN and ROOT_ADMIN only; requires authorization flow per Section 6.5.15.8)

b. Message Management Mode
Message Management Mode provides Admin access to all (:Message) nodes across all (:Mailbox) nodes.
The mode SHALL display a User selector at the top allowing the Admin to select any registered (:User) account.
On selection, the mode SHALL display the selected User's mailbox list using the same column layout as the Message Center (Subject, DateTime, HID, Sender, MessageType, Read/Unread).
The Admin SHALL be able to:
Open and read any message in any mailbox.
Transfer a message from one User's mailbox to another User's mailbox (see Section 6.5.15.9).
Soft-delete a message from any mailbox.
Hard-delete a message (ROOT_ADMIN only; requires confirmation dialog).
Filter messages by MessageType, date range, and read state.
Search messages by Subject and Body text.
Message operations in this mode SHALL follow the rules in Section 6.5.15.9.

c. Ownership Transfer Mode
Ownership Transfer Mode provides the global ownership transfer function.
The mode SHALL present two User selectors:
"Transfer FROM" — the source User (whose owned Core Data nodes are to be reassigned)
"Transfer TO" — the destination User (who will become the new Owner)
After both Users are selected, the mode SHALL display a summary count of all Core Data nodes owned by the source User broken down by node type.
The Admin SHALL have the option to:
Transfer ALL owned nodes from User A to User B in a single operation.
Select specific node types to transfer (with the remainder staying with User A or being handled separately).
Before executing, the mode SHALL display a confirmation dialog identifying the source User, the destination User, the count of affected nodes per type, and a warning that the operation is irreversible without a manual reversal.
Ownership Transfer rules are specified in Section 6.5.15.10.

d. Sandbox Management Mode
Sandbox Management Mode provides the Admin with tools to manage (:Sandbox) nodes during account disenrollment or on request.
The mode SHALL display a User selector at the top.
On selection, the mode SHALL list all (:Sandbox) nodes owned by the selected User, displaying for each:
Sandbox HID
Sandbox Name
Created date
LastTouch date
Number of child (:System) nodes
For each Sandbox the Admin SHALL be able to:
Transfer ownership to another active User.
Delete the Sandbox (and all its child data) after a two-step confirmation.
Sandbox deletion SHALL be a hard delete, not a soft delete.  The Admin SHALL be warned that deletion is permanent and irreversible.

e. Backend Status Mode
Backend Status Mode provides a read-only summary of Backend operational state for Admin awareness.
The mode SHALL display:
Backend connection IP and port
Backend service status (Up / Down / Degraded)
Database version
Node count summary by node type (Tool Data and Core Data categories)
Active session count
Last backup timestamp (if available from Backend API)
Backend Status Mode SHALL NOT provide controls to restart, configure, or modify the Backend.  Backend administration is performed through the Grafana dashboard and system-level tools per Section 1.2.1 of the SRS.



#### 6.5.15.6 (:User) Node Data Model



The Admin Tool operates against (:User) nodes in the Tool Data Model.  For completeness and as the authoritative definition of the unified User node, the (:User) node SHALL carry the following properties.
Identity:
Property	Display Label	Type	Edit	Default
UserName	"Username:"	String	edit (Admin only after creation)	"N/A"
DisplayName	"Display Name:"	String	edit	"Null"
UserEmail	"Email:"	String	edit	"N/A"
UserHash	"Credential Hash:"	String	fixed (system managed)	"N/A"
uuid	"UUID:"	String	fixed	"N/A"
Created	"Created:"	datetime	fixed	"N/A"
LastTouch	"Last Touch:"	datetime	fixed	"N/A"
Role and Status:
Property	Display Label	Type	Edit	Default	Notes
UserRole	"Role:"	Enum {USER, ADMIN, ROOT_ADMIN}	Admin only	"USER"	Set on creation; ROOT_ADMIN is set only by Installer and is immutable
AccountStatus	"Status:"	Enum {ACTIVE, SUSPENDED, DISENROLLED}	Admin only	"ACTIVE"
SuspendedAt	"Suspended At:"	datetime	fixed	"Null"	Set when status changes to SUSPENDED
SuspendedBy	"Suspended By:"	String	fixed	"Null"	UserName of Admin who suspended
DisenrolledAt	"Disenrolled At:"	datetime	fixed	"Null"	Set when status changes to DISENROLLED
DisenrolledBy	"Disenrolled By:"	String	fixed	"Null"	UserName of Admin who disenrolled
Relationships:
(:User)-[:OWNS_MAILBOX]->(:Mailbox) — all roles including ADMIN and ROOT_ADMIN have a mailbox.
No (:User) with `UserRole = ADMIN` or `UserRole = ROOT_ADMIN` SHALL appear as Owner or Creator on any Core Data node.



#### 6.5.15.7 Account Detail Panel

## 

Selecting any account in the Account Management roster SHALL open the Account Detail Panel for that account within the right panel, replacing the roster or appearing as a detail drawer.
The Account Detail Panel SHALL display all (:User) properties defined in Section 6.5.15.6.
The Account Detail Panel SHALL provide the following action buttons, each subject to the authorization rules in Section 6.5.15.8:
Edit — opens editable fields for DisplayName and UserEmail; UserName is editable by ROOT_ADMIN only; UserRole is not editable after creation except as described below.
Suspend Account — sets AccountStatus to SUSPENDED.  Visible only when AccountStatus = ACTIVE.
Reinstate Account — sets AccountStatus to ACTIVE.  Visible only when AccountStatus = SUSPENDED.
Disenroll Account — launches the Disenrollment Workflow (Section 6.5.15.11).  Visible only when AccountStatus = ACTIVE or SUSPENDED.
View Messages — navigates to Message Management Mode pre-filtered to this User's mailbox.
View Owned Data — displays a read-only count summary of Core Data nodes owned by this User, broken down by node type.
Transfer Owned Data — navigates to Ownership Transfer Mode pre-populated with this User as the Transfer FROM source.
Reset Password — generates a new temporary credential hash for the account (ROOT_ADMIN only for ADMIN accounts; any ADMIN for USER accounts).
Close — returns to the account roster.



#### 6.5.15.8 Account Creation and Authorization Rules



Creating a USER account:
Any authenticated ADMIN or ROOT_ADMIN MAY create a new USER account.
Creating a USER account SHALL:
Prompt the Admin for DisplayName, UserName, and UserEmail.
Assign a uuid and UserHash (temporary credential).
Set UserRole = USER, AccountStatus = ACTIVE.
Create the (:User) node in the Tool Data Model.
Create a new (:Mailbox) node and relate it via (:User)-[:OWNS_MAILBOX]->(:Mailbox).
Generate and deliver a SYSTEM message to the new User's mailbox welcoming them to SSTPA Tools.
All operations SHALL be committed as a single ACID transaction.
Creating an ADMIN account:
Creating an ADMIN account requires authorization from an existing ADMIN or ROOT_ADMIN.
The Admin Tool SHALL present a two-step authorization dialog:
The initiating Admin fills in the new account's DisplayName, UserName, and UserEmail and clicks "Authorize New Admin."
The initiating Admin re-enters their own Admin credentials (UserName and password/hash) to confirm authorization.
On successful authorization, the new ADMIN account is created with UserRole = ADMIN.
An ADMIN account SHALL NOT be created by the new account holder self-enrolling.  The authorization by an existing Admin is mandatory.
A ROOT_ADMIN account SHALL NOT be creatable through the Admin Tool under any circumstances.  ROOT_ADMIN is established only by the Installer process.
Duplicate prevention:
The Backend SHALL reject creation of any (:User) node with a UserName or UserEmail that matches an existing active or suspended account.
DISENROLLED account UserName reuse:
A UserName or UserEmail from a DISENROLLED account MAY be reused for a new account only if an Admin explicitly confirms the reuse in a confirmation dialog.



#### 6.5.15.9 Message Management Rules



Admin users SHALL be able to read, transfer, and delete messages in any User mailbox.
Message transfer:
Transferring a message moves it from the source User's mailbox to a target User's mailbox.  Transfer SHALL:
Create a copy of the (:Message) node in the target mailbox via (:Mailbox)-[:HAS_MESSAGE]->(:Message).
Remove the (:Mailbox)-[:HAS_MESSAGE]->(:Message) relationship from the source mailbox.
Set IsRead = False on the transferred message in the target mailbox.
Record the transfer in the message Body as an appended system note identifying the Admin who transferred it, the source mailbox, and the transfer timestamp.
Be committed as a single ACID transaction.
Message soft delete:
Soft-deleting a message SHALL:
Set IsDeleted = True and DeletedAt = current timestamp on the (:Message) node.
Remove the message from the active mailbox list view.
Retain the (:Message) node in the database for audit purposes.
Be reversible by the Admin through a "Show Deleted" filter and a "Restore" action.
Message hard delete (ROOT_ADMIN only):
Hard-deleting a message SHALL:
Permanently remove the (:Message) node and its (:Mailbox)-[:HAS_MESSAGE] relationship from the database.
Require a two-step confirmation dialog identifying the message subject, sender, recipient, and date.
Be irreversible.
Admin message scope:
An Admin SHALL be able to read, transfer, and delete messages of MessageType DIRECT and CHANGE_NOTIFICATION.
An Admin SHALL NOT delete messages of MessageType SYSTEM that have IsDeleted = False without ROOT_ADMIN privilege.

6.5.15.10 Global Ownership Transfer Rules

The global ownership transfer function reassigns the Owner and OwnerEmail properties on all Core Data nodes owned by a source User to a designated destination User.
The following rules govern the transfer:
The destination User SHALL have `UserRole = USER` and `AccountStatus = ACTIVE`.
An ADMIN or ROOT_ADMIN account SHALL NOT be the destination for Core Data ownership (Admins cannot own Core Data per Section 3.2.2).
The source User MAY be of any AccountStatus.
The transfer SHALL be atomic: either all selected nodes are transferred or none are.  Partial transfer on failure is not permitted.
The transfer SHALL update Owner, OwnerEmail, and LastTouch on every affected Core Data node.
The transfer SHALL NOT modify Creator or CreatorEmail on any node.
The transfer SHALL NOT generate ownership change notification messages in the Message Center (it is an administrative operation, not a peer edit).  The Admin Tool SHALL instead log the operation with a SYSTEM message sent to both the source User (if ACTIVE or SUSPENDED) and the destination User's mailboxes.
The Backend SHALL record the transfer event including: Admin who performed it, source UserName, destination UserName, count of nodes transferred per type, and timestamp.
The transfer SHALL be committed as a single ACID transaction.  If the transaction exceeds Backend timeout limits for very large ownership sets, the Backend SHALL support a chunked transfer protocol with progress reporting to the Admin Tool.
The Admin Tool SHALL display a real-time progress indicator during transfer execution for operations affecting more than 100 nodes.

6.5.15.11 Disenrollment Workflow

Disenrolling a User is a multi-step workflow that ensures all owned data and messages are properly dispositioned before the account is closed.
The Disenrollment Workflow SHALL proceed through the following steps in order.  The Admin Tool SHALL NOT allow the workflow to advance until each step is resolved.
Step 1 — Disenrollment Confirmation
The Admin Tool SHALL display a confirmation dialog identifying:
The User being disenrolled (DisplayName, UserName, UserEmail).
Count of Core Data nodes owned by the User per node type.
Count of Sandbox nodes owned by the User.
Count of messages in the User's mailbox (sent and received).
A warning that this action is permanent once completed.
The Admin SHALL explicitly confirm to proceed.
Step 2 — Core Data Ownership Transfer
The Admin Tool SHALL present the Ownership Transfer interface (Section 6.5.15.10) pre-populated with the disenrolling User as the source.
The Admin SHALL select a destination User for ownership transfer.  Alternatively, the Admin MAY assign different node types to different destination Users by repeating the transfer for selected node types.
The Admin SHALL confirm that all owned Core Data nodes have been transferred before proceeding.  The Admin Tool SHALL display a remaining-count indicator.  The workflow SHALL NOT advance while any Core Data nodes remain owned by the disenrolling User.
Step 3 — Sandbox Disposition
The Admin Tool SHALL display all (:Sandbox) nodes owned by the disenrolling User.
For each Sandbox the Admin SHALL choose one of:
Transfer to a named active USER account.
Delete the Sandbox and all its child data (with confirmation).
The workflow SHALL NOT advance until all Sandboxes are either transferred or deleted.
Step 4 — Message Disposition
The Admin Tool SHALL display the disenrolling User's mailbox.
The Admin SHALL choose one of the following for the mailbox:
Transfer all messages to a named active User's mailbox.
Transfer selected messages and delete the remainder.
Delete all messages (soft delete with option for hard delete by ROOT_ADMIN).
Export messages as a JSON or CSV file before deletion (see Section 6.5.15.14).
The workflow SHALL NOT advance until the Admin has confirmed message disposition.
Step 5 — Account Closure
Upon completion of Steps 1–4, the Admin Tool SHALL display a final summary:
Nodes transferred (count and destination User).
Sandboxes transferred or deleted.
Messages transferred, deleted, or exported.
The Admin SHALL click "Confirm Disenrollment" to execute the final account closure.
Account closure SHALL:
Set AccountStatus = DISENROLLED, DisenrolledAt = current timestamp, DisenrolledBy = current Admin UserName on the (:User) node.
Revoke the UserHash / credential to prevent future login.
Retain the (:User) node in the database as a historical record; it SHALL NOT be deleted.
Be committed as a single ACID transaction.
After disenrollment, the (:User) node SHALL remain queryable by Admin for audit purposes but SHALL NOT appear in the active account roster by default.  A "Show Disenrolled" toggle SHALL make disenrolled accounts visible.

6.5.15.12 ROOT_ADMIN Exclusive Functions

The following functions are available only when `UserRole = ROOT_ADMIN`:
Hard-delete any message (Section 6.5.15.9).
Disenroll an ADMIN account (using the same Disenrollment Workflow as for USER accounts).
Suspend an ADMIN account.
Reset the password/credential hash of an ADMIN account.
Authorize creation of new ADMIN accounts (ADMIN accounts may also do this; ROOT_ADMIN is not exclusively required).
Reset the ROOT_ADMIN's own credential hash via a dedicated "Reset My Credentials" function in Account Management, with a mandatory re-authentication step.
The ROOT_ADMIN account itself SHALL NOT be disenrollable, suspendable, or demotable through any Admin Tool function.  Any attempt to perform these actions on the ROOT_ADMIN account SHALL result in a blocking error message: "The Root Admin account cannot be modified through the Admin Tool."



#### 6.5.15.13 Performance Requirements



The Admin Tool SHALL:
Load the full account roster in under 2 seconds for installations with up to 500 registered accounts.
Load a User's mailbox message list in under 2 seconds for mailboxes with up to 10,000 messages.
Complete a global ownership transfer of up to 1,000 nodes in a single transaction within 10 seconds.
Display a progress indicator for any operation expected to take more than 2 seconds.
Maintain UI responsiveness during all Backend operations; long-running operations SHALL be executed asynchronously with a cancel option where feasible.
Report Backend connection status within 3 seconds of opening.
All Admin Tool write operations SHALL be ACID compliant.
The Admin Tool SHALL use paginated queries for all list-returning operations.  Default page size SHALL be 50 rows.



#### 6.5.15.14 Export Requirements



The Admin Tool SHALL support export of the following data for offline record-keeping and audit:
Account roster export — all (:User) nodes (excluding UserHash) in CSV or JSON format, including disenrolled accounts.
Message export — all messages from a selected User's mailbox in JSON or CSV format; export SHALL include all (:Message) properties except any internally computed identifiers not meaningful outside the database.
Ownership transfer log — a JSON record of all global ownership transfer operations performed, including Admin who executed, source User, destination User, node counts by type, and timestamp.
Disenrollment record — a JSON or PDF summary of a completed disenrollment workflow, including all disposition choices and final confirmation details.
Exports SHALL be written to the local file system at a path selected by the Admin through a standard file save dialog.
Exports SHALL NOT include UserHash or credential data.



#### 6.5.15.15 Backend Integration Requirements



The Admin Tool SHALL retrieve and mutate data exclusively through the Backend API.
Required Backend API capabilities include:
Retrieval of all (:User) nodes with all properties (UserHash excluded from response).
Retrieval of (:User) by UserName, UserEmail, or uuid.
Creation of new (:User) nodes with associated (:Mailbox).
Update of (:User) properties: DisplayName, UserEmail, UserRole, AccountStatus, SuspendedAt, SuspendedBy, DisenrolledAt, DisenrolledBy.
Retrieval of all (:Mailbox) and (:Message) nodes for a given User.
Transfer of (:Message) between mailboxes.
Soft delete and hard delete of (:Message) nodes.
Retrieval of Core Data node counts owned by a given User, broken down by node type.
Execution of global ownership transfer (Owner + OwnerEmail update) across all Core Data nodes for a source User.
Retrieval of all (:Sandbox) nodes owned by a given User.
Transfer of (:Sandbox) ownership.
Deletion of (:Sandbox) and all descendant nodes.
Backend status and node count summary queries.
All operations SHALL require a valid Admin session token; the Backend SHALL reject unauthenticated or USER-role requests to all Admin API endpoints.
All Admin Tool write operations SHALL be ACID compliant and transactional.

6.5.15.16 Error Handling

If a Backend operation fails, the Admin Tool SHALL:
Display a clear error message identifying the operation that failed and the reason returned by the Backend.
NOT commit any partial state; all transactions SHALL roll back on failure.
Allow the Admin to retry the failed operation or cancel.
Log the error with timestamp, Admin user, and attempted operation in a session error log accessible within the Admin Tool.
If the Backend connection is lost during a multi-step workflow, the Admin Tool SHALL:
Freeze the current workflow state.
Display a connection-lost warning.
Allow the Admin to resume the workflow after reconnection.
NOT automatically retry destructive operations (delete, disenroll) on reconnection without Admin confirmation.
If an attempt is made to perform a ROOT_ADMIN-only operation by an ADMIN user, the Admin Tool SHALL display: "This operation requires Root Admin authorization."

6.5.15.17 Test and Verification Requirements

The Admin Tool SHALL be verified through test and analysis.
The system SHALL verify that:
The Admin Tool is not visible to, and cannot be invoked by, a USER-role session.
An ADMIN-role session can open the Admin Tool and perform all ADMIN functions.
A ROOT_ADMIN-role session can perform all ROOT_ADMIN-exclusive functions.
New USER accounts are created with correct properties, mailbox, and welcome message.
New ADMIN accounts require existing Admin authorization and are created correctly.
A ROOT_ADMIN account cannot be created through the Admin Tool.
Account suspension sets correct properties and prevents login.
Account reinstatement restores correct status and allows login.
The Disenrollment Workflow does not advance past Step 2 while owned Core Data nodes remain.
The Disenrollment Workflow does not advance past Step 3 while Sandboxes remain undispositioned.
Global ownership transfer updates Owner and OwnerEmail on all target nodes and does not modify Creator or CreatorEmail.
Global ownership transfer is atomic: on simulated failure mid-transfer, no partial state is committed.
Message transfer correctly moves a message between mailboxes with audit note appended.
Message soft delete sets IsDeleted and retains the node; message is not returned in the default mailbox list.
Message hard delete (ROOT_ADMIN) permanently removes the node.
The ROOT_ADMIN account cannot be suspended, disenrolled, or demoted by any Admin Tool operation.
Exports contain correct data and exclude credential hashes.
All write operations roll back on Backend error with no partial state committed.
Backend Status Mode displays correct connection and node count data.



#### 6.5.15.18 UX Design Principles



The Admin Tool SHALL follow the same visual style and interaction conventions as other SSTPA Add-on Tools.
The Admin Tool SHALL provide clear visual role badges distinguishing USER, ADMIN, and ROOT_ADMIN accounts in all list views using non-icon visual treatments (color, label, border style) consistent with the SSTPA Tools visual encoding rules.
AccountStatus SHALL be visually distinguished in the roster:
ACTIVE — default appearance.
SUSPENDED — muted color treatment with "Suspended" label.
DISENROLLED — struck-through or greyed-out; shown only when "Show Disenrolled" toggle is enabled.
Destructive operations (disenroll, hard delete, Sandbox delete) SHALL always require a two-step confirmation with a clear description of what will be permanently changed or removed.
The Disenrollment Workflow SHALL present clearly labeled step indicators so the Admin always knows which step they are on and how many remain.
Progress indicators SHALL be displayed for all Backend operations expected to take more than 2 seconds.
The Admin Tool SHALL never perform a destructive operation in the background without the Admin's explicit confirmation in the foreground.
ROOT_ADMIN-only functions SHALL be visually marked with a distinct "Root Admin Only" badge or label so an ADMIN user understands why certain controls are inactive for them.



### 6.5.16 The Attack Tool

#### 6.5.16.1 Tool Purpose

The Attack Tool is an Add-on Tool used to develop, organize, and manage the
(:Attack) node population for each entity in the active System of Interest (SoI).
It is the prerequisite tool for the Loss Tool: the Attack Tool produces the Tier 3
(:Attack) node associations that the Loss Tool consumes when building Attack Trees.

The Attack Tool provides a structured workspace for associating (:Attack) nodes to
(:Interface), (:SystemFunction), and (:Component) nodes in the active SoI, either by
creating new (:Attack) nodes directly, cloning them from MITRE ATT\&CK, MITRE ATLAS,
or MITRE EMB3D Reference Data, or importing them from existing nodes in the SoI.
It also supports building Attack hierarchies (Strategy → Tactic → Procedure) via
(:Attack)-[:SUBORDINATE_TO]->(:Attack) relationships and assigning leaf-node metric
values for use in Attack Tree calculations.

The tool described here SHALL be branded at the top of the pop-up window as
"Attack Tool".

The Attack Tool SHALL be visually and interactively consistent with other SSTPA
Add-on Tools.

The Attack Tool SHALL allow the User to:

1. View all (:Interface), (:SystemFunction), and (:Component) nodes in the active SoI
organized in a tabular entity roster.
2. For each entity, view all (:Attack) nodes currently associated with it via
[:EXPLOITS] or through (:Hazard)-[:USES_ATTACK]->(:Attack) where the Hazard
is associated to the entity's SoI.
3. Create new (:Attack) nodes and associate them to entities via [:EXPLOITS].
4. Clone (:Attack) nodes from Reference Data (ATT\&CK Tactic, Technique,
Sub-Technique; ATLAS Technique; EMB3D Vulnerability) using the Reference Tool
clone-and-own pattern.
5. Build Attack hierarchies by creating [:SUBORDINATE_TO] relationships between
(:Attack) nodes (Strategy → Tactic → Procedure).
6. Assign AttackLevel (STRATEGY, TACTIC, PROCEDURE) to each (:Attack) node.
7. Assign MetricsJSON (leaf-node metric values) to (:Attack) nodes.
8. Scope (:Attack) nodes to specific (Asset, Criticality, Assurance) contexts
using the optional [:TARGETS_LOSS] relationship.
9. Mark (:Attack) nodes as IsRVCandidate = True where the analyst judges an Attack
to represent a plausible Residual Vulnerability.
10. View and navigate the full Attack hierarchy for the active SoI.
11. Remove [:EXPLOITS] associations subject to orphan and cascade rules.
12. Create new (:Hazard) nodes and associate them to entities and Assets when an
Attack represents a new threatening condition.

The Attack Tool operates on the same Core Data Model entity nodes (Interface,
Function, Element, Attack) used by the Trace Tool and consumed by the Loss Tool.
It does NOT create (:AT_RELATES_TO] relationships; those are the Loss Tool's
responsibility.

\---

#### 6.5.16.2 Tool Wireframe

The Attack Tool window SHALL be divided into three primary regions:

**Left Panel — Entity Roster**

A scrollable list of all (:Interface), (:SystemFunction), and (:Component) nodes in the
active SoI. Rows are grouped by node type (Interfaces first, then Functions, then
Elements). Each row displays:

* Node type badge (INT / FUN / EL)
* HID
* Name
* Number of associated (:Attack) nodes (count badge)
* Loss Tool Readiness indicator (green/yellow/grey — same semantics as Trace Tool)

A filter toolbar above the roster allows filtering by: node type, entity name,
"Has Attacks" / "No Attacks", Criticality coverage.

Selecting an entity row loads its Attack associations in the center panel.

**Center Panel — Attack Association View**

Displays all (:Attack) nodes associated with the selected entity, organized in
a collapsible hierarchy showing Strategy → Tactic → Procedure relationships.

Each (:Attack) row displays:

* HID
* Name
* AttackLevel badge (STRATEGY / TACTIC / PROCEDURE)
* ReferenceFramework and ReferenceID (if cloned from Reference Data)
* IsRVCandidate indicator
* MetricsJSON values (abbreviated; expandable)
* Action buttons: Edit, Add Subordinate, Clone from Reference, Remove Association

A toolbar provides:

* "New Attack" — creates a new (:Attack) and associates it to the selected entity
* "Clone from Reference" — opens the Reference Tool in Assignment Mode filtered to
(:AK_Technique), (:AT_Technique), and (:EMB3D_Vulnerability) node types
* "View Full Hierarchy" — switches to Hierarchy Mode showing all Attacks in the SoI
* "Asset Scope Filter" — filters displayed Attacks by Asset/Criticality/Assurance context

**Right Panel — Attack Detail Panel**

Displays all editable properties of the currently selected (:Attack) node:

* Identity: HID, Name, ShortDescription, LongDescription
* Classification: AttackLevel, IsRVCandidate
* Reference: ReferenceFramework, ReferenceID, ReferenceURL
* Metrics: MetricsJSON (key-value editor)
* Relationships: list of entities this Attack EXPLOITS, list of Countermeasures
that BLOCK it, list of subordinate Attacks, parent Attack (if any)

An "Edit" button stages changes; "Commit" persists.

The Attack Tool window SHALL support resize and maximize.

\---

#### 6.5.16.3 Invocation

The Attack Tool SHALL be launched from the SSTPA Control Panel.

If a Data Drawer is open for an (:Attack) node, the Attack Tool SHALL open with
that Attack selected in the Attack Association View and its entity highlighted in
the Entity Roster.

If a Data Drawer is open for an (:Interface), (:SystemFunction), or (:Component) node, the
Attack Tool SHALL open with that entity selected in the Entity Roster and its
associated Attacks displayed in the Attack Association View.

If a Data Drawer is open for an (:Asset) node, the Attack Tool SHALL open in
Hierarchy Mode filtered to Attacks relevant to that Asset's entity relationships
(entities with Trace coverage for that Asset).

If a Data Drawer is open for a (:Loss) node, the Attack Tool SHALL open filtered to
entities that participate in that Loss's Environment via States with [:VALID_IN].

If no valid Data Drawer context exists, the Attack Tool SHALL open with the full
entity roster and no entity pre-selected.

Opening the Attack Tool SHALL NOT change the current SoI.

\---

#### 6.5.16.4 Supported Node Context

The Attack Tool SHALL support invocation when the Data Drawer is open for:

* (:Attack)
* (:Interface)
* (:SystemFunction)
* (:Component)
* (:Asset)
* (:Loss)
* (:System)

The tool SHALL load on open:

* All (:Interface), (:SystemFunction), and (:Component) nodes in the active SoI.
* All (:Attack) nodes associated with any entity in the active SoI via [:EXPLOITS].
* All [:SUBORDINATE_TO] relationships among (:Attack) nodes in the active SoI.
* All (:Hazard)-[:USES_ATTACK]->(:Attack) relationships for Hazards in the SoI.
* All (:Countermeasure)-[:BLOCKS]->(:Attack) relationships in the active SoI
(read-only display; management of [:BLOCKS] is the Loss Tool's responsibility).
* All (:Asset) nodes in the active SoI with Criticality and Assurance properties
(for Asset Scope Filter).
* Reference Data node types needed for clone operations: (:AK_Technique),
(:AT_Technique), (:EMB3D_Vulnerability).

\---

#### 6.5.16.5 Modes of Operation

The Attack Tool SHALL support two modes:

**a. Entity Mode (default)**

Entity Mode is the primary working mode. The Entity Roster is active and the
center panel shows the Attack associations for the selected entity.

In Entity Mode the User can:

* Select any entity to view its Attack associations.
* Create, clone, edit, and remove Attack associations for the selected entity.
* Build or extend Attack hierarchies for Attacks associated with the selected entity.
* Assign metrics and AttackLevel to Attacks.

**b. Hierarchy Mode**

Hierarchy Mode presents a tree visualization of all (:Attack) nodes in the active
SoI, organized by [:SUBORDINATE_TO] relationships.

The hierarchy canvas SHALL display:

* Strategy-level Attacks as root nodes.
* Tactic-level Attacks as children of their parent Strategies.
* Procedure-level Attacks as children of their parent Tactics.
* Attacks with no [:SUBORDINATE_TO] parent are displayed as standalone nodes.
* Each node displays HID, Name, AttackLevel badge, and associated entity count.
* Edges represent [:SUBORDINATE_TO] relationships.

In Hierarchy Mode the User can:

* Rearrange the hierarchy by dragging Attacks to new parent positions.
* Select an Attack to view its Detail Panel.
* Filter the hierarchy by Asset scope, AttackLevel, or entity association.
* Add new [:SUBORDINATE_TO] relationships by drag or explicit "Set Parent" action.
* Remove [:SUBORDINATE_TO] relationships.

\---

#### 6.5.16.6 Attack Creation

The Attack Tool SHALL allow the User to create new (:Attack) nodes within the
active SoI.

**New Attack (User-defined):**

The User SHALL provide:

* Name (required)
* ShortDescription (required)
* AttackLevel (required; defaults to TACTIC)
* LongDescription (optional)

On creation:

* The Backend assigns HID and uuid per Section 3.3.8.
* Owner and Creator = current authenticated User.
* Created and LastTouch = current timestamp.
* IsRVCandidate = False (default).
* MetricsJSON = Null.

The new Attack is immediately associated to the selected entity via
(:Attack)-[:EXPLOITS]->(entity) if an entity is selected. If no entity is
selected, the Attack is created as a standalone SoI Attack with no [:EXPLOITS]
relationship; the User must associate it to at least one entity before it can
appear in an Attack Tree.

**Clone from Reference Data:**

The User SHALL be able to clone an (:AK_Technique), (:AT_Technique), or
(:EMB3D_Vulnerability) node into a new (:Attack) node using the Reference Tool
clone-and-own pattern.

The clone operation SHALL:

1. Open the Reference Tool in Assignment Mode filtered to the authorized node types.
2. The User selects a Reference item.
3. The Reference Tool returns the selected item to the Attack Tool.
4. The Attack Tool creates a new (:Attack) node with:

   * Name = Reference item Name.
   * ShortDescription = Reference item ShortDescription (truncated to 500 chars).
   * LongDescription = Reference item LongDescription.
   * ReferenceFramework = Reference item FrameworkName.
   * ReferenceID = Reference item ExternalID.
   * ReferenceURL = constructed from ExternalID and framework URL pattern.
   * AttackLevel = mapped from Reference item type: ATT\&CK Tactic → STRATEGY,
ATT\&CK Technique → TACTIC, ATT\&CK Sub-Technique → PROCEDURE, ATLAS
Technique → TACTIC, EMB3D Vulnerability → TACTIC.
5. The (:Attack)-[:REFERENCES]->(Reference node) relationship is created.
6. The Attack is associated to the selected entity via [:EXPLOITS].

\---

#### 6.5.16.7 Attack Hierarchy Management

The Attack Tool SHALL allow the User to build and maintain Attack hierarchies
via [:SUBORDINATE_TO] relationships.

**Creating a subordinate Attack:**

From any (:Attack) in the Attack Association View, the User may select
"Add Subordinate" which:

* Creates a new (:Attack) node or opens a selector for existing Attacks.
* Creates (:Attack child)-[:SUBORDINATE_TO]->(Attack parent).
* Sets AttackLevel on the child to the next level below the parent
(STRATEGY parent → TACTIC child default; TACTIC parent → PROCEDURE child default).

**Constraints:**

* [:SUBORDINATE_TO] SHALL be acyclic (enforced by Backend per Section 3.3.6).
* Maximum hierarchy depth is 3 levels (STRATEGY → TACTIC → PROCEDURE).
* An (:Attack) SHALL NOT have more than one parent (tree structure, not DAG).
* An (:Attack) without a parent is a root-level Attack in the hierarchy.

**Display in Loss Tool:**

When the Loss Tool builds an Attack Tree, Attacks with [:SUBORDINATE_TO]
children are displayed as branch nodes that can be expanded to show their
procedure-level children. The Loss Tool uses the deepest available level
(PROCEDURE) for metric calculations when PROCEDURE nodes are present.

\---

#### 6.5.16.8 Asset Scope Filtering

The Attack Tool SHALL provide an Asset Scope Filter to focus the Entity Roster
and Attack associations on entities relevant to a specific Loss analysis.

The Asset Scope Filter allows the User to select:

* An (:Asset) from the active SoI.
* A Criticality dimension (if the Asset has multiple Criticalities).
* An Assurance dimension.

When a scope filter is active:

* The Entity Roster is filtered to show only entities that have CURRENT
Trace ([:HOLDS], [:TRANSPORTS], or [:USES]) relationships to the selected Asset.
* The Attack Association View for each entity is filtered to show only Attacks
that are relevant to that entity-Asset combination (i.e. Attacks that EXPLOIT
the entity or are reachable via [:USES_ATTACK] from a Hazard that THREATENS
the Asset).
* The filter state is displayed prominently in the top bar.

This filter does NOT modify the graph; it is a display filter only.

\---

#### 6.5.16.9 Metric Assignment

The Attack Tool SHALL allow the User to assign MetricsJSON values to (:Attack)
nodes for use in Attack Tree metric calculations.

The MetricsJSON editor in the Attack Detail Panel SHALL:

* Display existing metric key-value pairs from MetricsJSON.
* Allow the User to add new key-value pairs by entering a metric name and
numeric value.
* Allow the User to edit existing values.
* Allow the User to remove key-value pairs.
* Validate that all values are numeric.

The metric names used in MetricsJSON on (:Attack) nodes SHOULD match the
MetricNames defined in MetricDefinitionsJSON on relevant (:Loss) nodes. The
Attack Tool MAY display a warning when a metric name on an Attack does not match
any metric defined on a Loss associated with the Attack's entity, but SHALL NOT
block Commit on this condition.

\---

#### 6.5.16.10 Validation Requirements

The Attack Tool SHALL validate the following before Commit:

* New (:Attack) nodes have non-null Name.
* AttackLevel is one of the authorized enum values.
* [:EXPLOITS] relationships connect an (:Attack) to an (:Interface), (:SystemFunction),
or (:Component) in the active SoI.
* [:SUBORDINATE_TO] relationships do not create cycles.
* [:SUBORDINATE_TO] hierarchy depth does not exceed 3 levels.
* MetricsJSON values, when set, are numeric.

The Attack Tool SHALL display a warning (non-blocking) for:

* (:Attack) nodes with AttackLevel = PROCEDURE that have no MetricsJSON values
(these will use LeafDefault in any Attack Tree metric calculation).
* (:Attack) nodes with no [:EXPLOITS] relationship (these cannot appear in an
Attack Tree until associated to an entity).
* Entities in the SoI with no associated (:Attack) nodes (these will have no
Tier 3 content in any Attack Tree).

\---

#### 6.5.16.11 Data Drawer Integration

Selecting a node in the Attack Tool SHALL populate the Data Drawer with that
node's properties if a Data Drawer is open.

The Attack Tool SHALL allow the User to open a Data Drawer for any displayed
(:Attack), (:Interface), (:SystemFunction), or (:Component) node from its row or
Detail Panel.

\---

#### 6.5.16.12 Backend Integration Requirements

The Attack Tool SHALL retrieve and mutate data through the Backend API.

Required Backend capabilities:

* Retrieval of all (:Interface), (:SystemFunction), and (:Component) nodes for the SoI.
* Retrieval of all (:Attack) nodes associated to SoI entities via [:EXPLOITS].
* Retrieval of all [:SUBORDINATE_TO] relationships among (:Attack) nodes.
* Retrieval of (:Hazard)-[:USES_ATTACK]->(:Attack) chains for the SoI.
* Retrieval of (:Countermeasure)-[:BLOCKS]->(:Attack) relationships (read-only).
* Creation of (:Attack) nodes with all properties.
* Creation and deletion of [:EXPLOITS] relationships.
* Creation and deletion of [:SUBORDINATE_TO] relationships.
* Creation of [:REFERENCES] relationship between (:Attack) and Reference node.
* Update of all editable (:Attack) properties.
* Acyclicity validation on [:SUBORDINATE_TO] before commit.
* Depth validation on [:SUBORDINATE_TO] hierarchy.
* Reference Tool integration: clone property retrieval from Reference node.

All Attack Tool write operations SHALL be ACID compliant.

\---

#### 6.5.16.13 Performance Requirements

The Attack Tool SHALL:

* Load the full entity roster and Attack associations for a SoI with up to 300
entities and 500 Attack nodes in under 3 seconds.
* Render the Attack hierarchy in Hierarchy Mode for up to 500 nodes in under
3 seconds.
* Complete a clone-from-Reference operation in under 2 seconds excluding
Reference Tool interaction time.
* Display a progress indicator for operations over 2 seconds.

\---

#### 6.5.16.14 Export Requirements

The Attack Tool SHALL support the following exports:

* **Entity Attack Coverage Report** (CSV): all entities with their associated
Attack count, AttackLevel distribution, and IsRVCandidate count.
* **Attack Catalog** (CSV or Markdown): all (:Attack) nodes in the SoI with
HID, Name, AttackLevel, ReferenceFramework, ReferenceID, MetricsJSON summary,
and associated entity HIDs.
* **Attack Hierarchy** (Markdown): the full [:SUBORDINATE_TO] hierarchy as an
indented list.

\---

#### 6.5.16.15 Test and Verification Requirements

The Attack Tool SHALL be verified through test and analysis.

The system SHALL verify that:

* New (:Attack) nodes receive valid HID, uuid, and correct default properties.
* [:EXPLOITS] relationships are created correctly linking an Attack to an entity
in the active SoI.
* Clone from Reference correctly copies Name, ShortDescription, LongDescription,
ReferenceFramework, ReferenceID to the new (:Attack) node.
* Clone from Reference creates the [:REFERENCES] relationship to the source node.
* [:SUBORDINATE_TO] creation is rejected when it would create a cycle.
* [:SUBORDINATE_TO] creation is rejected when it would exceed depth 3.
* AttackLevel mapping from Reference item type applies correct defaults.
* MetricsJSON values are validated as numeric on Commit.
* Asset Scope Filter correctly filters entities to those with CURRENT Trace
coverage for the selected Asset.
* The Attack Tool does not create [:AT_RELATES_TO] relationships.
* Opening the Attack Tool does not change the current SoI.
* All write operations roll back completely on Backend error.

\---

#### 6.5.16.16 UX Design Principles

The Attack Tool SHALL follow SSTPA Tools visual style and Add-on Tool conventions.

AttackLevel badges SHALL be visually distinct:

* STRATEGY: bold upper-case label in a distinct color.
* TACTIC: standard label.
* PROCEDURE: italic or subdued label.

IsRVCandidate = True Attacks SHALL display a "RV Candidate" badge in amber.

Attacks with no [:EXPLOITS] relationship SHALL be flagged in the Entity Roster
and Detail Panel as "Unassociated — cannot appear in Attack Tree."

The Reference Tool modal SHALL display ATT\&CK Tactic/Technique/Sub-Technique
hierarchy and ATLAS Tactic/Technique hierarchy to allow the User to navigate to
the appropriate level before cloning.

The hierarchy canvas in Hierarchy Mode SHALL use the same visual conventions
as the Goal Keeper Tool's GSN canvas, with directed downward edges representing
[:SUBORDINATE_TO] and nodes distinguished by AttackLevel shape or color treatment.

#### 6.5.16.17 Model Text Panel

ModelTextLanguages: ["KERML"]. Scope: the displayed Attack hierarchy —
Attack features with AttackLevel, metric attributes, #externalref
annotations, and SubordinateTo / Exploits / Defeats / Blocks / TargetsLoss
connectors per Section 3.7.6. Edit mode supports the Attack Tool's
authorized mutations.


### 6.5.17 Controls Tool

#### 6.5.17.1 Purpose

The Controls Tool will assist Users in developing, tailoring, tracing, and documenting the Security Controls Baseline applicable to a selected System of Interest (SoI).
The Controls Tool will support the Risk Management Framework (RMF), cyber Resilience and Cyber Survivability process by:

* Categorizing the SoI.
* Selecting the initial Security Controls Baseline.
* Applying Controls Overlays (CNSSI 1253 Attachments).
* Applying Cyber Survivability Attributes (CSA).
* Applying Cyber Resilience principles, techniques, and approaches (MITRE ResiliencyFramework and Cyber Survivability Attributes)
* Recording tailoring decisions.
* Relating applicable controls to Core Data (:SecurityControl) nodes.
* Creating and relating (:Requirement) nodes used to realize selected controls.
* Producing authoritative baseline data for use by the Reports Tool.

The Controls Tool SHALL operate on exactly one SoI at a time.
The Controls Tool SHALL create and maintain a single analytical Controls Baseline for the active SoI.
The Controls Tool SHALL NOT modify Reference Data.
The Controls Tool SHALL create, modify, and relate Core Data nodes only through Backend APIs.

\---


##### 6.5.17.1.1 Expected User Workflow 

The expected workflow for the Controls Tool SHALL be: 

Step 1 — SoI Categorization 

The User: 

1. Selects the active SoI. 
2. Assigns: 
   * Confidentiality Impact 
   * Integrity Impact 
   * Availability Impact 
3. Records categorization rationale. 

The Controls Tool generates the initial CNSSI 1253 baseline where applicable. 

--- 

Step 2 — Cyber Resilience Development 

The User: 

1. Reviews Cyber Resiliency Framework principles. 
2. Selects Design Principles. 
3. Selects Techniques. 
4. Selects Approaches. 
5. Records SoI-specific implementation strategy. 
6. Records rationale and assumptions. 

The Controls Tool records Cyber Resilience analytical intent. 

--- 

Step 3 — Cyber Survivability Development 

The User: 

1. Selects applicable Cyber Survivability Attributes. 
2. Associates CSA to: 
   * Assets 
   * Losses 
   * Functions 
   * Elements 
3. Records implementation rationale. 

The Controls Tool records survivability intent. 

--- 

Step 4 — CSA Expansion 

The Backend: 

1. Identifies all NIST SP 800-53 controls associated with selected CSA. 
2. Identifies all controls associated with selected Cyber Resilience approaches. 
3. Adds those controls to the candidate Controls Baseline. 

The resulting Controls Baseline SHALL represent the union of: 

* CNSSI 1253 controls 
* Overlay controls 
* CSA-derived controls 
* Cyber Resilience-derived controls 
* User-added controls 

--- 

Step 5 — Baseline Tailoring 

The User: 

1. Reviews candidate controls. 
2. Tailors controls out where justified. 
3. Records tailoring rationale. 

The Controls Tool preserves all tailoring decisions. 

--- 

Step 6 — Control Mapping 

The User: 

1. Maps controls to Core Data (:SecurityControl) nodes. 
2. Creates new Core Data Controls where required. 
3. Associates Countermeasures. 

--- 

Step 7 — Requirement Development 

The User: 

1. Creates Requirements implementing Controls. 
2. Creates Verification methods. 
3. Reviews completeness. 

--- 

Step 8 — RMF Baseline Completion 

The Controls Tool validates: 

* Categorization completeness. 
* CSA traceability completeness. 
* Cyber Resilience traceability completeness. 
* Control mappings. 
* Requirement mappings. 
* Tailoring rationale. 

The Controls Tool marks the baseline: 

DRAFT 
    → REVIEWED 
        → BASELINED 
            → APPROVED 

when validation conditions are satisfied.This revised workflow changes the conceptual center of gravity of the tool in an important way: CNSSI 1253 categorization is no longer the sole driver of the baseline. Instead, the baseline becomes the union of four analytical sources: 

1. CNSSI 1253 categorization-derived controls. 


2. Overlay-derived controls. 


3. CSA-derived controls. 


4. Cyber Resilience-derived controls. 




#### 6.5.17.2 Controls Baseline Analytical Node

The Controls Tool SHALL create and maintain a (:ControlsBaseline) node for each SoI Relationship such that (:System)-[:HAS_CONTROLS_BASELINE]->(:ControlsBaseline)


Each SoI SHALL have exactly one active Controls Baseline but may have many inactive Controls Baselines.
The active Controls Baseline will represent the authoritative RMF analysis state for the SoI.
The Controls Tool SHALL be the only Add-on Tool authorized to modify (:ControlsBaseline).

\---



#### 6.5.17.3 Governing Reference Frameworks

The Controls Tool SHALL support:

* CNSSI 1253
* NIST SP 800-53
* Applicable RMF Overlays
* MITRE Cyber Resiliency Engineering Framework (CREF)
* MITRE Cyber Survivability Attributes (CSA)
* MTR210700R1 and successor MITRE Cyber Survivability guidance

The Sustainment Environment will ingest normalize and import to the Reference Data Set and the Controls Tool will use it to allow the User to tailor the (:ControlsBaseline):

* Cyber Survivability Attributes (CSA)
* Cyber Resiliency Strategic Design Principles
* Cyber Resiliency Structural Design Principles
* Cyber Resiliency Techniques
* Cyber Resiliency Approaches
* CSA-to-NIST Control mappings
* Resilience-to-CSA mappings

##### 6.5.17.3.1 Revised Categorization Model 

Property Group: Categorization 

Property| Type| Edit| Default 
ConfidentialityImpact| Enum {NONE, LOW, MODERATE, HIGH}| edit| NONE 
IntegrityImpact| Enum {NONE, LOW, MODERATE, HIGH}| edit| NONE 
AvailabilityImpact| Enum {NONE, LOW, MODERATE, HIGH}| edit| NONE 
CategorizationRationale| String| edit| Null 

The value NONE SHALL indicate the SoI is not categorized as a National Security System (NSS) control baseline driver for that dimension. 

The Controls Tool SHALL permit all three values to be NONE. 

The Controls Tool SHALL support systems that are: 

* Non-NSS 
* NSS 
* Mixed-regime systems 

The Controls Tool SHALL NOT require CNSSI 1253 baseline generation when all three impact values are NONE. 


---

#### 6.5.17.4 Controls Baseline Properties

#### Categorization

|Property|Type|
|-|-|
|ConfidentialityImpact|Enum {NONE, LOW, MODERATE, HIGH}|
|IntegrityImpact|Enum {NONE, LOW, MODERATE, HIGH}|
|AvailabilityImpact|Enum {NONE, LOW, MODERATE, HIGH}|
|CategorizationRationale|String|

The value NONE SHALL support non-NSS systems.

The Controls Tool SHALL preserve independent C, I, and A values.

The Controls Tool SHALL NOT compute a High Water Mark.

### Overlay Selection

|Property|Type|
|-|-|
|OverlayIDs|JSON Array|
|OverlayRationale|String|

### Cyber Survivability

|Property|Type|
|-|-|
|SelectedCSA|JSON Array|
|SurvivabilityRationale|String|

### Cyber Resilience

|Property|Type|
|-|-|
|SelectedPrinciples|JSON Array|
|SelectedTechniques|JSON Array|
|SelectedApproaches|JSON Array|
|ResilienceRationale|String|

### Baseline Data

|Property|Type|
|-|-|
|ControlsBaselineJSON|Serialized JSON|

\---

#### 6.5.17.5 ControlsBaselineJSON

```json
{
  "schema":"SSTPA-CB-1.0",
  "categorization":{},
  "overlays":[],
  "survivability":[],
  "resilience":[],
  "controls":[]
}
```

The JSON SHALL be the authoritative analytical artifact used by the Controls Tool.

6.5.17.5A Cyber Resilience Development Mode 

The Controls Tool SHALL support Cyber Resilience Development Mode. 

Cyber Resilience Development Mode SHALL allow the User to develop Cyber Resilience intent before NIST control selection. 

The Controls Tool SHALL present Cyber Resilience Framework data using hierarchical progressive disclosure: 

Strategic Design Principle 
    └── Structural Design Principle 
            └── Technique 
                    └── Approach 
                            └── Associated CSA 
                                    └── Associated NIST Controls 

The User SHALL be able to: 

* Select Strategic Design Principles. 
* Select Structural Design Principles. 
* Select Techniques. 
* Select Approaches. 
* Record SoI-specific implementation rationale. 
* Record SoI-specific implementation strategy. 
* Record assumptions. 
* Record implementation notes. 
* Record residual concerns. 

The User SHALL be able to relate selected approaches to: 

* (:SecurityControl) 
* (:Countermeasure) 
* (:Requirement) 
* (:SystemFunction) 
* (:Interface) 
* (:Component) 

within the current SoI. 

--- 

Cyber Resilience Approach Capture 

For each selected Cyber Resilience Approach the Controls Tool SHALL record: 

Property| Type 
ApproachID| String 
ApproachName| String 
PrincipleID| String 
TechniqueID| String 
UserStrategy| String 
UserImplementationApproach| String 
UserRationale| String 
Assumptions| String 
ResidualConcerns| String 

These values SHALL be stored in ControlsBaselineJSON. 

These values SHALL be available to Reports Tool. 

--- 

6.5.17.5B Cyber Survivability Development Mode 

The Controls Tool SHALL support Cyber Survivability Development Mode. 

Cyber Survivability Development Mode SHALL allow the User to: 

* Select Cyber Survivability Attributes (CSA). 
* Review associated Cyber Resilience Approaches. 
* Review associated Design Principles. 
* Review associated NIST SP 800-53 controls. 
* Record SoI-specific survivability rationale. 

The Controls Tool SHALL display CSA data in hierarchical form: 

Cyber Survivability Attribute 
        └── Resilience Principles 
                └── Techniques 
                        └── Approaches 
                                └── Associated NIST Controls 

The User SHALL be able to: 

* Add CSA to the SoI baseline. 
* Remove CSA from the SoI baseline. 
* Record rationale. 
* Associate CSA to SoI Assets. 
* Associate CSA to Losses. 
* Associate CSA to Controls. 
* Associate CSA to Countermeasures. 

The Controls Tool SHALL preserve all associations in ControlsBaselineJSON. 

--- 

Cyber Survivability Attribute Capture 

For each selected CSA the Controls Tool SHALL record: 

Property| Type 
CSAID| String 
CSAName| String 
Description| String 
UserApplicabilityStatement| String 
UserImplementationDescription| String 
RelatedAssetHIDs| Array 
RelatedLossHIDs| Array 
RelatedControlHIDs| Array 

--- 

6.5.17.5C CSA-to-Control Expansion Mode 

The Controls Tool SHALL support CSA-to-Control Expansion. 

When a User selects one or more Cyber Survivability Attributes, the Backend SHALL: 

1. Identify all associated NIST SP 800-53 controls. 
2. Identify all associated enhancements. 
3. Identify all associated overlay controls. 
4. Add those controls to the candidate Controls Baseline. 

The Backend SHALL mark the source of each added control. 

Allowed Sources SHALL include: 

* CNSSI1253 
* Overlay 
* CSA 
* CyberResilience 
* UserAdded 

A single control MAY have multiple sources. 

The Controls Tool SHALL preserve all contributing sources. 

Example: 

{ 
  "controlId":"SC-30", 
  "sources":[ 
      "CNSSI1253", 
      "CSA", 
      "CyberResilience" 
  ] 
} 

--- 

6.5.17.5D Resilience-to-CSA Traceability 

The Controls Tool SHALL maintain traceability: 

Design Principle 
        ↓ 
Technique 
        ↓ 
Approach 
        ↓ 
CSA 
        ↓ 
NIST Control 
        ↓ 
Core Data Control 
        ↓ 
Countermeasure 
        ↓ 
Requirement 

The Controls Tool SHALL preserve the complete trace chain in ControlsBaselineJSON. 

The Reports Tool SHALL be able to generate: 

* Cyber Resilience Traceability Report 
* CSA Traceability Report 
* CSA-to-Control Matrix 
* CSA-to-Requirement Matrix 
* Cyber Survivability Design Report 

---

#### 6.5.17.6 Baseline Generation Mode

The Controls Tool SHALL:

1. Accept categorization.
2. Apply overlays.
3. Apply CSA selections.
4. Apply Cyber Resilience selections.
5. Generate the candidate baseline.

The resulting baseline SHALL represent the union of:

* CNSSI1253 controls
* Overlay controls
* CSA-derived controls
* Cyber Resilience-derived controls
* User-added controls

##### 6.5.17.6.1 CNSSI 1253 Initial Baseline Generation Algorithm 

The Controls Tool SHALL generate the initial Security Controls Baseline from the System of Interest (SoI) categorization using CNSSI 1253 Appendix D control allocation tables. 

The Backend SHALL preserve independent Confidentiality, Integrity, and Availability impact values. 

The Backend SHALL NOT compute or use a High Water Mark baseline. 

The Backend SHALL evaluate the Confidentiality, Integrity, and Availability dimensions independently. 

The Backend SHALL maintain a normalized representation of all CNSSI 1253 Appendix D control allocation tables as Reference Data. 

Each CNSSI 1253 control allocation record SHALL contain: 

* ControlID 
* ControlName 
* ControlFamily 
* PrivacyBaselineSymbol 
* ConfidentialityLow 
* ConfidentialityModerate 
* ConfidentialityHigh 
* IntegrityLow 
* IntegrityModerate 
* IntegrityHigh 
* AvailabilityLow 
* AvailabilityModerate 
* AvailabilityHigh 
* NSSJustification 
* ParameterValues 
* PrivacyImplementationConsiderations 
* AssuranceFlag 
* ResiliencyFlag 
* ATTACKFlag 
* WithdrawnFlag 

The Backend SHALL process every CNSSI 1253 control allocation record using the following algorithm. 

Step 1 – Privacy Baseline Selection 

If PrivacyBaselineSymbol equals: 

* X 
* + 

the control SHALL be added to the candidate baseline. 

The control source SHALL be: 

CNSSI1253 

The selection basis SHALL be: 

PrivacyBaseline 

Step 2 – Confidentiality Selection 

The Backend SHALL read: 

ControlsBaseline.ConfidentialityImpact 

If the impact value is: 

* LOW 
* MODERATE 
* HIGH 

the corresponding Confidentiality column from the CNSSI 1253 allocation record SHALL be evaluated. 

If the value is: 

* X 
* + 

the control SHALL be added to the candidate baseline. 

The selection basis SHALL be recorded as: 

Confidentiality 

Step 3 – Integrity Selection 

The Backend SHALL read: 

ControlsBaseline.IntegrityImpact 

If the impact value is: 

* LOW 
* MODERATE 
* HIGH 

the corresponding Integrity column from the CNSSI 1253 allocation record SHALL be evaluated. 

If the value is: 

* X 
* + 

the control SHALL be added to the candidate baseline. 

The selection basis SHALL be recorded as: 

Integrity 

Step 4 – Availability Selection 

The Backend SHALL read: 

ControlsBaseline.AvailabilityImpact 

If the impact value is: 

* LOW 
* MODERATE 
* HIGH 

the corresponding Availability column from the CNSSI 1253 allocation record SHALL be evaluated. 

If the value is: 

* X 
* + 

the control SHALL be added to the candidate baseline. 

The selection basis SHALL be recorded as: 

Availability 

Step 5 – Exclusions 

The Backend SHALL NOT add controls whose selected allocation symbol is: 

* -- 
* blank 

unless subsequently added through: 

* Overlay processing 
* Cyber Survivability processing 
* Cyber Resilience processing 
* User addition 

Step 6 – Control Deduplication 

The Backend SHALL maintain exactly one baseline entry for each ControlID. 

If a control is selected from multiple allocation paths: 

* Privacy Baseline 
* Confidentiality 
* Integrity 
* Availability 

the Backend SHALL merge the selections into a single control entry. 

The control SHALL retain all selection bases. 

Example: 

{ 
  "ControlID":"AC-2", 
  "SelectedBy":[ 
    { 
      "Basis":"Confidentiality", 
      "Impact":"Moderate" 
    }, 
    { 
      "Basis":"Integrity", 
      "Impact":"High" 
    } 
  ] 
} 

Step 7 – Initial Baseline Population 

For each selected control the Backend SHALL create an entry in ControlsBaselineJSON.controls. 

Each control entry SHALL contain: 

* ControlID 
* ControlName 
* Source 
* Selected 
* TailoredOut 
* TailorReason 
* MappedControl 
* RequirementCount 
* Status 
* SelectedBy 
* ParameterValues 
* NSSJustification 
* PrivacyImplementationConsiderations 
* AssuranceFlag 
* ResiliencyFlag 
* ATTACKFlag 

The initial values SHALL be: 

{ 
  "Selected": true, 
  "TailoredOut": false, 
  "TailorReason": null, 
  "MappedControl": null, 
  "RequirementCount": 0, 
  "Status": "Incomplete" 
} 

Step 8 – Initial Baseline Completion 

The resulting control set SHALL constitute the CNSSI 1253 Initial Controls Baseline. 

The resulting baseline SHALL become the initial contents of: 

ControlsBaselineJSON.controls 

The resulting baseline SHALL be available for: 

* Overlay processing 
* Cyber Survivability expansion 
* Cyber Resilience expansion 
* Tailoring 
* Control Mapping 
* Requirement Generation 

Subsequent processing SHALL modify the candidate baseline but SHALL preserve the original CNSSI 1253 selection traceability information. 

##### 6.5.17.6.2 CNSSI 1253 Selection Traceability 

Each baseline control SHALL maintain traceability to the CNSSI 1253 allocation decision that caused the control to be selected. 

Each selection record SHALL capture: 

* Basis 
* SecurityObjective 
* ImpactLevel 
* AllocationSymbol 

Valid Basis values SHALL include: 

* PrivacyBaseline 
* Confidentiality 
* Integrity 
* Availability 

This traceability SHALL be preserved throughout baseline tailoring and report generation. 

##### 6.5.17.6.3 CNSSI 1253 Reference Data Model 

The Sustainment Environment SHALL import and normalize CNSSI 1253 Appendix D allocation tables into Reference Data. 

Each imported allocation row SHALL be related to the corresponding NIST SP 800-53 Reference Control. 

Relationship: 

(:CNSSI1253Allocation)-[:ALLOCATES]->(:ReferenceControl) 

The Controls Tool SHALL use only normalized CNSSI 1253 allocation data when generating the Initial Controls Baseline.One additional recommendation: add a new property to each control in ControlsBaselineJSON.controls called: 

"SelectedBy":[] 

because it preserves exactly why the control entered the baseline (Privacy, C, I, A, Overlay, CSA, Cyber Resilience, User Added). This will make later tailoring reports, RMF documentation, and explainability much easier and avoids losing CNSSI 1253 traceability after overlays and CSA expansion are applied. 





\---

## 6.5.17.7 Cyber Resilience Development Mode

The Controls Tool SHALL support Cyber Resilience Development Mode.

Framework hierarchy:

```text
Strategic Design Principle
    -> Structural Design Principle
        -> Technique
            -> Approach
                -> Associated CSA
                    -> Associated NIST Controls
```

The User SHALL be able to:

* Select principles.
* Select techniques.
* Select approaches.
* Record SoI-specific implementation strategy.
* Record rationale.
* Record assumptions.
* Record residual concerns.

For each selected approach the Tool SHALL capture:

* ApproachID
* ApproachName
* UserStrategy
* UserImplementationApproach
* UserRationale
* Assumptions
* ResidualConcerns

\---

## 6.5.17.8 Cyber Survivability Development Mode

The Controls Tool SHALL support Cyber Survivability Development Mode.

Framework hierarchy:

```text
Cyber Survivability Attribute
    -> Resilience Principles
        -> Techniques
            -> Approaches
                -> Associated NIST Controls
```

The User SHALL be able to:

* Select CSA.
* Associate CSA to Assets.
* Associate CSA to Losses.
* Associate CSA to Controls.
* Associate CSA to Countermeasures.
* Record implementation rationale.

For each CSA the Tool SHALL capture:

* CSAID
* CSAName
* UserApplicabilityStatement
* UserImplementationDescription
* RelatedAssetHIDs
* RelatedLossHIDs
* RelatedControlHIDs

\---

## 6.5.17.9 CSA-to-Control Expansion Mode

The Backend SHALL:

1. Identify controls associated with selected CSA.
2. Identify controls associated with selected Cyber Resilience approaches.
3. Add those controls to the candidate baseline.

Control source values SHALL include:

* CNSSI1253
* Overlay
* CSA
* CyberResilience
* UserAdded

A control MAY have multiple sources.

\---

## 6.5.17.10 Tailoring Mode

The User SHALL be able to:

* Tailor a control out.
* Restore a tailored control.
* Modify tailoring rationale.

Tailored controls SHALL remain in the baseline.

A tailored control SHALL require TailorReason before Commit.

\---

## 6.5.17.11 Control Mapping Mode

The User SHALL be able to:

* Relate baseline controls to existing Core Data (:SecurityControl) nodes.
* Create new Core Data (:SecurityControl) nodes.
* Maintain many-to-one mappings.

Relationship:

;   (:ControlsBaseline)-[:IMPLEMENTS_BY]->(:SecurityControl)



The mapping SHALL update ControlsBaselineJSON.

\---

## 6.5.17.12 Control Creation

When creating a new Core Data (:SecurityControl), the Tool SHALL populate:

* ControlID
* ControlName
* ControlStatement
* SatisfactionStatement

from Reference Data.

\---

## 6.5.17.13 Requirement Generation

The User SHALL be able to:

* Create Requirements implementing controls.
* Relate existing Requirements.
* Create Countermeasures where needed.

The Controls Tool SHALL prepopulate requirement fields from control metadata.


#### 6.5.17.14 Model Text Panel

ModelTextLanguages: ["KERML"].  Scope: the displayed Controls —
Reference Data, #externalref
annotations, and Subordinate relationships.
connectors per Section 3.7.6.  Edit mode supports the Controls Tool's
authorized mutations.


\---




## 6.5.17.14 User Interface

The Controls Tool SHALL use a table-based interface.

Columns SHALL include:

* Control ID
* Control Name
* Source
* Selected
* Tailored Out
* Tailor Reason
* Mapped Control
* Requirement Count
* Status

Rows SHALL be color coded:

* Green = implemented
* Yellow = incomplete
* Gray = tailored
* Red = validation error

Property editing SHALL use standard SSTPA GUI property drawers.

\---

## 6.5.17.15 Expected User Workflow

### Step 1 – SoI Categorization

Assign Confidentiality, Integrity, and Availability impact values.

### Step 2 – Cyber Resilience Development

Select Principles, Techniques, and Approaches and document implementation strategy.

### Step 3 – Cyber Survivability Development

Select CSA and associate them with Assets, Losses, and Controls.

### Step 4 – CSA Expansion

Expand CSA and Cyber Resilience selections into NIST SP 800-53 controls.

### Step 5 – Baseline Tailoring

Review and tailor controls.

### Step 6 – Control Mapping

Map controls to Core Data Controls.

### Step 7 – Requirement Development

Create Requirements and Verification traceability.

### Step 8 – Baseline Completion

Validate completeness and baseline the package.

\---

## 6.5.17.16 Validation Rules

The Controls Tool SHALL validate:

* Missing tailoring rationale.
* Missing mappings.
* Missing requirements.
* Invalid references.
* Deleted controls.
* Deleted requirements.
* CSA traceability completeness.
* Cyber Resilience traceability completeness.

The Backend SHALL reject invalid commits.

\---

## 6.5.17.17 Report Integration

The Reports Tool SHALL use:

* (:ControlsBaseline)
* ControlsBaselineJSON
* Related Controls
* Related Countermeasures
* Related Requirements
* Related Verifications

to generate:

* Security Requirements Traceability Matrix (SRTM)
* RMF Data Package
* Control Implementation Summary
* Tailoring Report
* Overlay Report
* CSA Traceability Report
* Cyber Resilience Traceability Report
* CSA-to-Control Matrix
* CSA-to-Requirement Matrix











\#7 Installer

The SSTPA Tools SHALL operate on an air-gapped Microsoft Windows 11 Enterprise based network with no access to the internet.  The Installer SHALL execute a window needing expected available components in this architecture and present the User with resource requirements needed for successful installation prior to installation.



# 8 Development Pipeline

The product of the Development Pipeline is the SSTPA Tools Installer.
The Development Pipeline must be configured to support build, integration, test and commit to GitHub when tests pass and production of error report when it does not.
The Development Pipeline SHALL be configured to operate on the following platform:

As the SSTPA tool is developed on a Linux based system the SSTPA Tool SHALL also function on a system with the following characteristics:
Operating System: Ubuntu Studio 25.04
KDE Plasma Version: 6.3.4
KDE Frameworks Version: 6.12.0
Qt Version: 6.8.3
Kernel Version: 6.14.0-27-generic (64-bit)
Graphics Platform: Wayland
Processors: 28   Intel  Core  i7-14700K
Memory: 31.1 GiB of RAM
Graphics Processor: Intel  Graphics



# 9 Sustainment Environment

## 9.1 Purpose and Scope

## 

The Sustainment Environment is a set of offline development-system tools, scripts, and procedures used to acquire, validate, normalize, transform, and load Reference Framework data into the SSTPA Backend database as part of the Build and Integration Pipeline. It operates entirely outside the SSTPA Tool application runtime and is never executed on a deployed SSTPA Tool system.
The Sustainment Environment produces a deterministic, versioned, SSTPA-format graph data artifact (a Neo4j-compatible Cypher script or database dump) that is incorporated into the Backend at build time. This artifact is the sole authorized means of updating Reference Graph data.
The Sustainment Environment SHALL:
Operate on the SSTPA Development System (Linux Ubuntu 25.04, offline-capable).
Accept as input a locally cached archive of source framework data files.
Produce as output a versioned Neo4j Cypher load script (or equivalent dump file) ready for integration into the SSTPA Backend Docker compose build.
Validate output data against SSTPA Reference Graph schema before producing the artifact.
Record a manifest of all source files, their checksums, versions, and the transformation rules applied.
NOT access the internet during the transform or load phases. All source files SHALL be pre-acquired in a separate Acquisition Phase.

## 9.2 Sustainment Environment Architecture

The Sustainment Environment consists of five sequential stages:

```
Acquisition → Archive → Normalize → Transform → Validate → Load-Artifact
```

Each stage is a discrete, independently runnable tool. The complete pipeline is orchestrated by a single pipeline runner that invokes each stage in order and halts on any stage failure.
Stage 1 — Acquisition
Tool name: `sstpa-ref-acquire`
Purpose: Download authoritative source files from their canonical repositories and store them in a versioned local archive directory. This is the only stage that requires internet connectivity and SHALL be run on the development system before the development system is air-gapped for build operations.
Actions:
Clone or fetch from:
`https://github.com/mitre-attack/attack-stix-data` (specific version tag, e.g. v19.1)
`https://github.com/mitre-atlas/atlas-data` (specific version tag)
`https://github.com/usnistgov/oscal-content` (specific commit hash)
`https://github.com/mitre/emb3d` (specific version tag)
Extract the target files listed in Section 9.3 Source File Manifest.
Compute SHA-256 checksums of each source file.
Write an Acquisition Manifest (JSON) recording: source URL, version/commit, file path, SHA-256, acquisition timestamp, and license identifier.
Store all source files and the manifest in a versioned archive directory: `ref-archive/YYYY-MM-DD-vN/`
Inputs: Internet access, version selection configuration file.
Outputs: `ref-archive/YYYY-MM-DD-vN/` directory containing source files and Acquisition Manifest.
Completion condition: All expected source files are present and checksums are recorded.

Stage 2 — Normalize
Tool name: `sstpa-ref-normalize`
Purpose: Parse each source file format (STIX 2.1 JSON, ATLAS YAML, OSCAL JSON) and produce a common Intermediate Normalized Form (INF) — a set of typed JSON files, one per source framework, containing a flat list of normalized object records ready for graph transformation.
Actions per source:
ATT\&CK (STIX 2.1 JSON):
Parse each STIX bundle JSON using the `stix2` Python library.
Filter objects by type to the set authorized in Section 3.4.1.2.
Filter out objects where `revoked = True` or `x_mitre_deprecated = True` (flag these but do not include in active INF; write them to a separate deprecated archive).
For each object, extract the fields defined in Section 3.4.1.3 into a normalized record.
For each STIX `relationship` object, extract source STIX ID, target STIX ID, and relationship_type into a normalized edge record.
Resolve `kill_chain_phases` to tactic-technique membership edges.
Write output to: `inf/attck-enterprise-19.1.json`, `inf/attck-ics-19.1.json`, `inf/attck-mobile-19.1.json`.
INF format for ATT\&CK nodes:

```json
{
  "format": "SSTPA-INF-ATT_CK-1.0",
  "framework": "ATT&CK",
  "version": "19.1",
  "domain": "enterprise",
  "nodes": [
    {
      "sstpa_label": "AK_Technique",
      "stix_id": "attack-pattern--...",
      "external_id": "T1059",
      "name": "Command and Scripting Interpreter",
      "short_description": "...",
      "long_description": "...",
      "stix_type": "attack-pattern",
      "is_subtechnique": false,
      "parent_technique_id": null,
      "tactic_ids": ["TA0002"],
      "platforms": ["Windows", "Linux", "macOS"],
      "is_deprecated": false,
      "is_revoked": false,
      "stix_created": "2017-05-31T21:30:44.697Z",
      "stix_modified": "2023-03-30T21:01:39.935Z",
      "stix_version": "2.1",
      "raw_data": "{ ...full original STIX JSON... }"
    }
  ],
  "edges": [
    {
      "relationship_type": "AK_SUBTECHNIQUE_OF",
      "source_stix_id": "attack-pattern--...",
      "target_stix_id": "attack-pattern--...",
      "stix_relationship_id": "relationship--..."
    }
  ]
}
```

ATLAS (YAML):
Parse `ATLAS.yaml` using PyYAML.
Iterate `matrices[0].tactics`, `matrices[0].techniques`, `matrices[0].mitigations`, `case-studies`.
For each object, extract the fields defined in Section 3.4.2.3 into a normalized record.
Derive tactic-technique membership edges from `techniques[].tactics[].id` entries.
Derive sub-technique edges from `techniques[].subtechnique-of` entries.
Derive ATT\&CK cross-reference edges from `techniques[].ATT&CK-reference` entries.
Write output to: `inf/atlas-5.4.json`.
INF format for ATLAS nodes:

```json
{
  "format": "SSTPA-INF-ATLAS-1.0",
  "framework": "ATLAS",
  "version": "5.4",
  "nodes": [
    {
      "sstpa_label": "AT_Technique",
      "external_id": "AML.T0043",
      "name": "...",
      "short_description": "...",
      "long_description": "...",
      "is_subtechnique": false,
      "parent_technique_id": null,
      "tactic_ids": ["AML.TA0002"],
      "attack_reference_id": "T1595",
      "attack_reference_url": "https://attack.mitre.org/techniques/T1595/",
      "technique_maturity": "Incident Report",
      "platforms": [],
      "raw_data": "{ ...full source YAML record as JSON... }"
    }
  ],
  "edges": [...]
}
```

NIST 800-53 (OSCAL JSON):
Parse the OSCAL catalog JSON.
Iterate `catalog.groups[]` to extract families.
For each group, iterate `controls[]` to extract controls.
For each control, iterate `controls[]` (sub-level) to extract enhancements.
Assemble control statement text by concatenating `parts` where `name = "statement"`.
Assemble supplemental guidance text from `parts` where `name = "guidance"`.
Extract `baseline-impact` and `priority` from `props`.
Extract related-control links from `links` where `rel = "related"`.
Write output to: `inf/nist-800-53-r5.json`.
INF format for NIST nodes:

```json
{
  "format": "SSTPA-INF-NIST-1.0",
  "framework": "NIST SP 800-53",
  "version": "Rev 5.2.0",
  "nodes": [
    {
      "sstpa_label": "NIST_Control",
      "external_id": "ac-1",
      "control_id": "AC-01",
      "name": "Policy and Procedures",
      "family_id": "ac",
      "short_description": "...",
      "long_description": "...",
      "supplemental_guidance": "...",
      "baseline_impact": ["LOW", "MODERATE", "HIGH"],
      "priority": "P1",
      "related_controls": ["ac-2", "pm-9"],
      "is_enhancement": false,
      "parent_control_id": null,
      "raw_data": "{ ...full OSCAL control object as JSON... }"
    }
  ],
  "edges": [
    {
      "relationship_type": "NIST_RELATED_TO",
      "source_external_id": "ac-1",
      "target_external_id": "ac-2"
    }
  ]
}
```

Inputs: `ref-archive/YYYY-MM-DD-vN/` directory and Acquisition Manifest.
Outputs: `inf/` directory containing INF JSON files and a Normalization Report (counts of nodes and edges per type per framework, list of objects filtered out with reasons).
Completion condition: All INF files present and well-formed per INF JSON Schema. Zero schema validation errors.

Stage 3 — Transform
Tool name: `sstpa-ref-transform`
Purpose: Convert INF JSON files to SSTPA Reference Graph representation: a Neo4j-compatible Cypher script that, when executed against the Backend database, creates all reference graph nodes, properties, and relationships.
Actions:
Read INF JSON files from Stage 2.
For each node record, generate a Cypher `MERGE` statement that:
Uses `ExternalID` + `FrameworkName` + `FrameworkVersion` as the unique key.
Sets all properties from the INF record mapped to SSTPA property names per Section 3.4.1.3, 3.4.2.3, 3.4.3.3.
Sets common Reference Framework Identity properties (Section 3.4.5).
Marks all nodes as read-only via a `_ReadOnly: true` property (enforced by Backend API layer).
For each edge record, generate a Cypher `MATCH + MERGE` statement that:
Finds source and target nodes by ExternalID + FrameworkName.
Creates the SSTPA relationship type per Section 3.4.1.4, 3.4.2.4, 3.4.3.4.
Generate cross-framework [:AT_MAPS_TO_ATTACK] edges between ATLAS techniques and ATT\&CK techniques where ATTACKReference_ID is present.
Prefix all generated Cypher with:
A transaction header and framework root node creation.
`// SSTPA Reference Graph Load Script vN — Generated YYYY-MM-DD`
`// Source Manifest: <path>`
Suffix all generated Cypher with a count verification query confirming expected node and edge counts match the INF Normalization Report.
Write output to: `graph/sstpa-ref-load-YYYY-MM-DD-vN.cypher`
Intermediate representation example (Cypher fragment for AK_Technique):

```cypher
MERGE (n:AK_Technique {ExternalID: 'T1059', FrameworkName: 'ATT&CK', FrameworkVersion: '19.1'})
SET n.Name = 'Command and Scripting Interpreter',
    n.ShortDescription = '...',
    n.LongDescription = '...',
    n.Domain = 'enterprise',
    n.IsSubTechnique = false,
    n.IsDeprecated = false,
    n.IsRevoked = false,
    n.StixID = 'attack-pattern--...',
    n.StixType = 'attack-pattern',
    n.TacticIDs = ['TA0002'],
    n.Platforms = ['Windows','Linux','macOS'],
    n.StixVersion = '2.1',
    n._ReadOnly = true,
    n.ImportedAt = datetime('2026-05-24T00:00:00Z'),
    n.SourceURI = 'https://github.com/mitre-attack/attack-stix-data'
```

Inputs: `inf/` directory.
Outputs: `graph/sstpa-ref-load-YYYY-MM-DD-vN.cypher` and a Transform Report (counts, warnings).
Completion condition: Cypher script is syntactically valid. Transform Report shows zero errors and expected counts match INF Normalization Report.

Stage 4 — Validate
Tool name: `sstpa-ref-validate`
Purpose: Execute the generated Cypher script against a throwaway Neo4j instance, run structural and content validation queries, and confirm the Reference Graph is correct before authorizing the artifact for production use.
Actions:
Start a throwaway Neo4j instance (Docker container) on the Development System.
Execute `sstpa-ref-load-YYYY-MM-DD-vN.cypher` against the throwaway instance.
Run the following validation queries and assert expected results:
Count of (:AK_Technique) nodes by domain matches INF count.
Count of (:AK_Tactic) nodes matches expected.
Count of (:AT_Technique) nodes matches expected.
Count of (:NIST_Control) nodes matches expected (should be \~1000+ for Rev 5).
All (:AK_Technique) nodes have non-null ExternalID, Name, and LongDescription.
All (:NIST_Control) nodes have non-null ExternalID, ControlID, and LongDescription.
All [:AK_TACTIC_CONTAINS] edges point to valid (:AK_Technique) nodes.
All [:AT_MAPS_TO_ATTACK] edges point to existing (:AK_Technique) nodes.
Zero nodes have `_ReadOnly = false` or missing `_ReadOnly`.
Zero nodes have null ExternalID or null FrameworkVersion.
No duplicate (ExternalID, FrameworkName, FrameworkVersion) combinations exist.
Write Validation Report to: `validation/sstpa-ref-validate-report-YYYY-MM-DD-vN.json`
Stop and remove the throwaway Neo4j instance.
If all assertions pass, write `VALIDATED: PASS` to the pipeline status file.
If any assertion fails, write `VALIDATED: FAIL` with failure details, halt the pipeline.
Inputs: `graph/sstpa-ref-load-YYYY-MM-DD-vN.cypher`, Docker environment.
Outputs: Validation Report, pipeline status file.
Completion condition: All validation assertions pass.

Stage 5 — Load Artifact Production
Tool name: `sstpa-ref-package`
Purpose: Package the validated Cypher load script and manifest into a build artifact that the SSTPA Development Pipeline (Section 8) incorporates into the Backend Docker compose build.
Actions:
Verify pipeline status file shows `VALIDATED: PASS` before proceeding.
Bundle into `sstpa-ref-data-YYYY-MM-DD-vN.tar.gz`:
`sstpa-ref-load-YYYY-MM-DD-vN.cypher` — the Cypher load script
`acquisition-manifest.json` — source file provenance
`normalization-report.json` — INF counts and filtered-object record
`transform-report.json` — transform counts and warnings
`validation-report.json` — validation assertions and results
Compute SHA-256 of the tar.gz and write a `.sha256` companion file.
Copy the artifact bundle to the designated location in the SSTPA Development Pipeline artifacts directory.
Write a Release Note summarizing: framework names, versions, node counts by type, relationship counts, source file checksums, validation pass timestamp.
Inputs: All prior stage outputs, pipeline status file showing PASS.
Outputs: `sstpa-ref-data-YYYY-MM-DD-vN.tar.gz`, companion `.sha256`, Release Note.
Completion condition: Artifact produced and SHA-256 verified.



## 9.3 Source File Manifest



The following files SHALL be acquired in Stage 1 for each Sustainment cycle:
Framework	Source Repository	Target File(s)	Version Specification Method
ATT\&CK Enterprise	`mitre-attack/attack-stix-data`	`enterprise-attack/enterprise-attack-{V}.json`	Git tag (e.g. v19.1)
ATT\&CK ICS	`mitre-attack/attack-stix-data`	`ics-attack/ics-attack-{V}.json`	Git tag
ATT\&CK Mobile	`mitre-attack/attack-stix-data`	`mobile-attack/mobile-attack-{V}.json`	Git tag
ATLAS	`mitre-atlas/atlas-data`	`dist/ATLAS.yaml`	Git tag
NIST 800-53 Rev 5	`usnistgov/oscal-content`	`nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json`	Git commit hash
EMB3D	`mitre/emb3d`	`assets/emb3d-stix-2.0.1.json`	Git tag



## 9.4 Sustainment Trigger Policy



The Sustainment Environment SHALL be run when any of the following conditions occurs:
MITRE releases a new versioned ATT\&CK release (typically April and October annually).
MITRE releases a new versioned ATLAS release.
NIST publishes an update to the OSCAL content for SP 800-53 Rev 5.
MITRE releases a new EMB3D version.
A defect is found in the current Reference Graph data requiring correction.
The Sustainment Environment SHALL NOT be run except at these sanctioned intervals unless authorized by the SSTPA Tool Development Lead.
Each Sustainment cycle SHALL produce a new artifact version number (YYYY-MM-DD-vN format where N is monotonically increasing within a calendar date).



## 9.5 License Compliance Requirements



The Sustainment Environment SHALL preserve all source data properties verbatim in the RawData field of every Reference Graph node. No property SHALL be silently dropped, renamed in a way that obscures its origin, or modified during normalization or transformation.
The following attribution requirements SHALL be met in the generated Cypher load script header and in the Release Note:
MITRE ATT\&CK: "This product uses the MITRE ATT\&CK framework. ATT\&CK is a registered trademark and copyright of The MITRE Corporation. Licensed under CC BY 4.0."
MITRE ATLAS: "This product uses MITRE ATLAS. Copyright 2023-2026 The MITRE Corporation. Licensed under Apache 2.0."
NIST SP 800-53: "This product incorporates NIST SP 800-53 Rev 5 content. NIST-authored material is in the public domain. Attribution: National Institute of Standards and Technology, U.S. Department of Commerce."
EMB3D: "This product uses MITRE EMB3D. Copyright 2024 The MITRE Corporation. Licensed under Apache 2.0."



## 9.6 Sustainment Environment Tool Implementation Requirements



The Sustainment Environment tools SHALL be implemented in Python 3.12 or later.
Required Python libraries:
`stix2` (cti-python-stix2) — for STIX 2.1 JSON parsing and object access
`pyyaml` — for ATLAS YAML parsing
`jsonschema` — for INF JSON Schema validation
`neo4j` Python driver — for Stage 4 throwaway database execution
`hashlib` (stdlib) — for SHA-256 computation
`argparse` (stdlib) — for CLI argument handling
`logging` (stdlib) — for structured log output
Each stage tool SHALL:
Be runnable as a standalone CLI command with `--input` and `--output` path arguments.
Accept `--version` to display tool version.
Accept `--dry-run` to validate inputs and print expected actions without writing outputs.
Return exit code 0 on success, non-zero on any failure.
Write structured JSON logs to a configurable log directory.
The pipeline runner (`sstpa-ref-pipeline`) SHALL:
Accept a configuration YAML specifying source archive path, INF output path, graph output path, target framework versions, and log path.
Invoke each stage in order, passing outputs of each stage as inputs to the next.
Halt immediately on any stage failure and write a failure summary.
On success, write a complete pipeline execution record to the artifact bundle.


The Sustainment Environment Shall ingest normalize and import to the Reference Data Set:

* Cyber Survivability Attributes (CSA)
* Cyber Resiliency Strategic Design Principles
* Cyber Resiliency Structural Design Principles
* Cyber Resiliency Techniques
* Cyber Resiliency Approaches
* CSA-to-NIST Control mappings
* Resilience-to-CSA mappings

The Sustainment Environment Shall ingest normalize and import to the Reference Data Set the follow controls relationships and raw tables for use by Add-on Tools:

* MITRE Cyber Resiliency Engineering Framework (CREF) 
* MITRE Cyber Survivability Attributes (CSA) 
* MTR210700R1 MITRE Technical Report and successor versions 
* NIST SP 800-53 control mappings associated with CSA and Cyber Resiliency guidance 


## 9.7 Integration with Section 8 Development Pipeline



The SSTPA Development Pipeline (Section 8) SHALL include the Reference Data load step as a required build step executed before the Backend integration test suite runs.
The build step SHALL:
Verify that a valid `sstpa-ref-data-*.tar.gz` artifact exists in the artifacts directory.
Verify the SHA-256 of the artifact bundle.
Extract the Cypher load script.
Execute the Cypher load script against the build-time Neo4j instance.
Verify the node count post-load against the counts in the artifact Validation Report.
Fail the build if any of the above steps fail.
The Reference Data load step SHALL be idempotent: executing the Cypher script on a database that already contains the same data SHALL produce no errors and no duplicate nodes (ensured by `MERGE` semantics in the generated Cypher).

