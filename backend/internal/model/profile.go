// Package model implements the SysML 2.0 / KerML 1.0 interchange (SRS §3.7):
// the G2M translator (Core Data Model graph → standard textual notation) and
// the SSTPA Profile Library. Model text is a projection; the graph remains
// authoritative (§3.7.1).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

// SSTPAProfileVersion binds the Profile Library to the data schema VersionID
// (SRS §3.7.3).
const SSTPAProfileVersion = "0.7"

// ProfileLibrary returns the read-only KerML 1.0 'SSTPA Profile' library text
// (SRS §3.7.3): domain classifiers, associations, and metadata keyword
// definitions used by G2M output and required by M2G for type resolution.
func ProfileLibrary() string {
	return `// SSTPA Profile Library — KerML 1.0 (SRS §3.7.3)
// Version bound to data schema VersionID ` + SSTPAProfileVersion + `.
// 2025 Nicholas Triska. All rights reserved.

library package 'SSTPA Profile' {
    doc /* Read-only KerML 1.0 library defining SSTPA domain concepts not
           native to SysML 2.0. Shipped with SSTPA Tools. */

    // --- SSTPA Domain: KerML classifiers for KERML-domain node labels ---
    package 'SSTPA Domain' {
        classifier Asset;
        classifier DerivedAsset :> Asset;
        classifier Regime;
        classifier Hazard;
        classifier Loss;
        classifier Attack;
        classifier Countermeasure;
        classifier SecurityControl;
        // GSN assurance-case classifiers
        classifier GsnGoal;
        classifier GsnStrategy;
        classifier GsnContext;
        classifier GsnAssumption;
        classifier GsnJustification;
        classifier GsnSolution;
        // STPA control-loop roles
        behavior ControlAlgorithm;
        behavior ControlledProcess;
        step ControlAction;
        struct ProcessModel;
        classifier Feedback;
    }

    // --- SSTPA Associations: one assoc per KERML-domain relationship ---
    package 'SSTPA Associations' {
        assoc Holds       { end : Asset; feature TraceStateHID : String; feature TraceStatus : String; }
        assoc Transports  { end : Asset; feature TraceStateHID : String; feature TraceStatus : String; }
        assoc Uses        { end : Asset; feature TraceStateHID : String; feature TraceStatus : String; }
        assoc ValidIn;
        assoc HasLoss; assoc HasGoal; assoc HasRegime; assoc Derives;
        assoc LossEnvironment;
        assoc Threatens; assoc Violates; assoc UsesAttack;
        assoc Exploits; assoc Defeats; assoc Blocks; assoc SubordinateTo; assoc TargetsLoss;
        assoc Enforces; assoc Mitigates; assoc Satisfies;
        assoc AppliesTo;
        assoc HasRequirement;
        // Attack-tree gates specialize AtRefinement (D-8)
        assoc AtRefinement {
            feature TailoredOut : Boolean;
            feature TailorReason : String;
            feature CompleteBlock : Boolean;
            feature CompleteBlockReason : String;
            feature AllowedRV : Boolean;
            feature AllowedRVReason : String;
        }
        assoc AtAnd  :> AtRefinement;
        assoc AtOr   :> AtRefinement;
        assoc AtSand :> AtRefinement;
        assoc SupportedBy; assoc InContextOf; assoc SolutionEvidence;
        assoc Generates; assoc Commands; assoc Causes; assoc Produces;
        assoc Informs; assoc Tunes; assoc Implements;
    }

    // --- SSTPA Metadata: user-defined keywords (specialize SemanticMetadata) ---
    package 'SSTPA Metadata' {
        metadata def capability   :> Metaobjects::SemanticMetadata;
        metadata def sandbox      :> Metaobjects::SemanticMetadata;
        metadata def system       :> Metaobjects::SemanticMetadata;
        metadata def element      :> Metaobjects::SemanticMetadata;
        metadata def environment  :> Metaobjects::SemanticMetadata;
        metadata def purpose      :> Metaobjects::SemanticMetadata;
        metadata def validation   :> Metaobjects::SemanticMetadata;
        metadata def extend       :> Metaobjects::SemanticMetadata { attribute extensionPoint : String; }
        metadata def involves     :> Metaobjects::SemanticMetadata;
        metadata def parents      :> Metaobjects::SemanticMetadata;
        metadata def externalref  :> Metaobjects::SemanticMetadata {
            attribute framework : String;
            attribute externalId : String;
            attribute sourceUri : String;
        }
        metadata def sstpa        :> Metaobjects::SemanticMetadata { attribute schemaVersion : String; }
    }
}
`
}
