-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('uz', 'ru', 'en');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "GrantScope" AS ENUM ('OWN', 'ORG_UNIT', 'ORG');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'INVITED', 'ASSESSING', 'REVIEW', 'DECIDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('UNAPPROVED', 'APPROVED');

-- CreateEnum
CREATE TYPE "RubricPurpose" AS ENUM ('CANDIDATE', 'PERFORMANCE', 'LEVEL_REVIEW');

-- CreateEnum
CREATE TYPE "RubricVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ScoringMethod" AS ENUM ('AUTO_QUIZ', 'MANUAL', 'EVIDENCE_METRIC');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'SHORT_TEXT', 'PRACTICAL', 'SCENARIO', 'ERROR_IDENTIFICATION', 'INTERVIEW_NOTE');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('HUMAN', 'AI_DRAFT');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('CANDIDATE', 'PERFORMANCE', 'LEVEL_REVIEW');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'AI_ANALYZED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPEALED', 'REASSESSED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('SERVICE_RECORD', 'SALE', 'CUSTOMER_FEEDBACK', 'TRAINING', 'MENTORING', 'PROCESS_IMPROVEMENT', 'NEW_CUSTOMER', 'WORK_SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'CRM');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'UPHELD', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('RECOMMENDED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HiringDecisionType" AS ENUM ('HIRE', 'REJECT', 'HOLD');

-- CreateEnum
CREATE TYPE "RecommendationSubject" AS ENUM ('CANDIDATE', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "CompensationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DevelopmentItemStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('CASH', 'RECOGNITION');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PROPOSED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INVALID_OUTPUT');

-- CreateEnum
CREATE TYPE "CrmStatus" AS ENUM ('NOT_CONFIGURED', 'DEMO', 'CONNECTED', 'SYNC_ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('EMPLOYEES', 'SERVICE_RECORDS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "defaultLocale" "Locale" NOT NULL DEFAULT 'uz',
    "currency" CHAR(3) NOT NULL DEFAULT 'UZS',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" "Locale" NOT NULL DEFAULT 'uz',
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "lastLoginAt" TIMESTAMPTZ(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "scope" "GrantScope" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "orgUnitId" UUID,
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpires" TIMESTAMPTZ(3) NOT NULL,
    "absExpires" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionCompetency" (
    "positionId" UUID NOT NULL,
    "competencyId" UUID NOT NULL,
    "importance" SMALLINT NOT NULL,

    CONSTRAINT "PositionCompetency_pkey" PRIMARY KEY ("positionId","competencyId")
);

-- CreateTable
CREATE TABLE "CareerLevel" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "rank" SMALLINT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "expectations" JSONB NOT NULL DEFAULT '{}',
    "minTotalScore" INTEGER,
    "minMonthsAtPrevious" INTEGER,
    "minApprovedAssessments" INTEGER NOT NULL DEFAULT 1,
    "approval" "ApprovalState" NOT NULL DEFAULT 'UNAPPROVED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelRequirement" (
    "id" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "competencyId" UUID NOT NULL,
    "minScore" INTEGER NOT NULL,
    "isGate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LevelRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryBand" (
    "id" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "minAmount" BIGINT NOT NULL,
    "maxAmount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'UZS',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "approval" "ApprovalState" NOT NULL DEFAULT 'UNAPPROVED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubric" (
    "id" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "purpose" "RubricPurpose" NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricVersion" (
    "id" UUID NOT NULL,
    "rubricId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RubricVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "allowRenormalization" BOOLEAN NOT NULL DEFAULT false,
    "passThreshold" INTEGER,
    "changeNote" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RubricVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricCriterion" (
    "id" UUID NOT NULL,
    "rubricVersionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "competencyId" UUID,
    "weightBp" INTEGER NOT NULL,
    "method" "ScoringMethod" NOT NULL,
    "metricConfig" JSONB,
    "isGate" BOOLEAN NOT NULL DEFAULT false,
    "gateMinScore" INTEGER,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "minEvidenceCount" INTEGER NOT NULL DEFAULT 0,
    "allowNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "rubricVersionId" UUID NOT NULL,
    "criterionId" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" JSONB NOT NULL,
    "options" JSONB,
    "correctOptionIds" TEXT[],
    "rubricGuide" JSONB,
    "maxPoints" INTEGER NOT NULL DEFAULT 1,
    "source" "ContentSource" NOT NULL DEFAULT 'HUMAN',
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "aiRunId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "userId" UUID,
    "orgUnitId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "currentLevelId" UUID,
    "employeeNo" TEXT,
    "fullName" TEXT NOT NULL,
    "pseudonym" TEXT NOT NULL,
    "hiredOn" DATE NOT NULL,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "fromCandidateId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "fullName" TEXT,
    "email" CITEXT,
    "phone" TEXT,
    "experience" TEXT,
    "pseudonym" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "consentAt" TIMESTAMPTZ(3),
    "retentionUntil" TIMESTAMPTZ(3),
    "anonymizedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformancePeriod" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PerformancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "AssessmentKind" NOT NULL,
    "rubricVersionId" UUID NOT NULL,
    "employeeId" UUID,
    "candidateId" UUID,
    "periodId" UUID,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "totalScore" INTEGER,
    "calcSnapshot" JSONB,
    "calcVersion" TEXT,
    "feedback" TEXT,
    "evaluatorId" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "supersedesId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentInvite" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'uz',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "timeLimitMin" INTEGER,
    "startedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateResponse" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "autoPoints" INTEGER,
    "savedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionResult" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "criterionId" UUID NOT NULL,
    "computedScore" INTEGER,
    "aiSuggestedScore" INTEGER,
    "aiRunId" UUID,
    "humanScore" INTEGER,
    "finalScore" INTEGER,
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT,
    "scoredById" UUID,
    "scoredAt" TIMESTAMPTZ(3),

    CONSTRAINT "CriterionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "source" "EvidenceSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredOn" DATE NOT NULL,
    "serviceFee" BIGINT,
    "governmentFee" BIGINT,
    "quantity" INTEGER,
    "metrics" JSONB,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" UUID,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "importBatchId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAttachment" (
    "id" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAllocation" (
    "id" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "criterionId" UUID NOT NULL,

    CONSTRAINT "EvidenceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRecommendation" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "fromLevelId" UUID,
    "toLevelId" UUID NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "eligibility" JSONB NOT NULL,
    "basisAssessmentIds" TEXT[],
    "note" TEXT,
    "recommendedById" UUID NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerLevelHistory" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "promotionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerLevelHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiringDecision" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "assessmentId" UUID,
    "decision" "HiringDecisionType" NOT NULL,
    "levelId" UUID,
    "note" TEXT,
    "decidedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiringDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationRecommendation" (
    "id" UUID NOT NULL,
    "subject" "RecommendationSubject" NOT NULL,
    "candidateId" UUID,
    "employeeId" UUID,
    "positionId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "salaryBandId" UUID,
    "rangeMin" BIGINT,
    "rangeMax" BIGINT,
    "explanation" JSONB NOT NULL,
    "status" "CompensationStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedById" UUID NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentItem" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "competencyId" UUID,
    "title" TEXT NOT NULL,
    "targetScore" INTEGER,
    "dueOn" DATE,
    "status" "DevelopmentItemStatus" NOT NULL DEFAULT 'PLANNED',
    "source" "ContentSource" NOT NULL DEFAULT 'HUMAN',
    "aiRunId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DevelopmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardPolicy" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "rubricVersionId" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "kind" "RewardKind" NOT NULL DEFAULT 'CASH',
    "config" JSONB NOT NULL,
    "approval" "ApprovalState" NOT NULL DEFAULT 'UNAPPROVED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardBudget" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "RewardBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRecommendation" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "amount" BIGINT,
    "explanation" JSONB NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "paidMarkedById" UUID,
    "paidAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "rubricVersionId" UUID,
    "assessmentId" UUID,
    "inputHash" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" "AiRunStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "latencyMs" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceDocument" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "approval" "ApprovalState" NOT NULL DEFAULT 'UNAPPROVED',
    "validFrom" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmConnection" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "CrmStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalMapping" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "internalId" UUID NOT NULL,
    "payloadHash" TEXT,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorReport" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgUnit_orgId_path_idx" ON "OrgUnit"("orgId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_orgId_parentId_name_key" ON "OrgUnit"("orgId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_orgId_key_key" ON "Role"("orgId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_roleId_orgUnitId_key" ON "RoleAssignment"("userId", "roleId", "orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_absExpires_idx" ON "Session"("absExpires");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_orgId_key_key" ON "Specialty"("orgId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Position_specialtyId_key_key" ON "Position"("specialtyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_orgId_key_key" ON "Competency"("orgId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CareerLevel_orgId_key_key" ON "CareerLevel"("orgId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LevelRequirement_levelId_specialtyId_competencyId_key" ON "LevelRequirement"("levelId", "specialtyId", "competencyId");

-- CreateIndex
CREATE INDEX "SalaryBand_positionId_levelId_effectiveFrom_idx" ON "SalaryBand"("positionId", "levelId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Rubric_specialtyId_purpose_key" ON "Rubric"("specialtyId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "RubricVersion_rubricId_version_key" ON "RubricVersion"("rubricId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RubricCriterion_rubricVersionId_key_key" ON "RubricCriterion"("rubricVersionId", "key");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_rubricVersionId_status_idx" ON "AssessmentQuestion"("rubricVersionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_pseudonym_key" ON "Employee"("pseudonym");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_fromCandidateId_key" ON "Employee"("fromCandidateId");

-- CreateIndex
CREATE INDEX "Employee_orgId_orgUnitId_status_idx" ON "Employee"("orgId", "orgUnitId", "status");

-- CreateIndex
CREATE INDEX "Employee_positionId_idx" ON "Employee"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_orgId_employeeNo_key" ON "Employee"("orgId", "employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_pseudonym_key" ON "Candidate"("pseudonym");

-- CreateIndex
CREATE INDEX "Candidate_orgId_status_idx" ON "Candidate"("orgId", "status");

-- CreateIndex
CREATE INDEX "Candidate_retentionUntil_idx" ON "Candidate"("retentionUntil");

-- CreateIndex
CREATE UNIQUE INDEX "PerformancePeriod_orgId_startsOn_key" ON "PerformancePeriod"("orgId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_supersedesId_key" ON "Assessment"("supersedesId");

-- CreateIndex
CREATE INDEX "Assessment_orgId_kind_status_idx" ON "Assessment"("orgId", "kind", "status");

-- CreateIndex
CREATE INDEX "Assessment_employeeId_periodId_idx" ON "Assessment"("employeeId", "periodId");

-- CreateIndex
CREATE INDEX "Assessment_candidateId_idx" ON "Assessment"("candidateId");

-- CreateIndex
CREATE INDEX "Assessment_periodId_rubricVersionId_status_idx" ON "Assessment"("periodId", "rubricVersionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentInvite_assessmentId_key" ON "AssessmentInvite"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentInvite_tokenHash_key" ON "AssessmentInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateResponse_assessmentId_questionId_key" ON "CandidateResponse"("assessmentId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionResult_assessmentId_criterionId_key" ON "CriterionResult"("assessmentId", "criterionId");

-- CreateIndex
CREATE INDEX "Evidence_employeeId_periodId_status_idx" ON "Evidence"("employeeId", "periodId", "status");

-- CreateIndex
CREATE INDEX "Evidence_orgId_status_idx" ON "Evidence"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_orgId_source_externalId_key" ON "Evidence"("orgId", "source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceAttachment_storageKey_key" ON "EvidenceAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "EvidenceAllocation_assessmentId_criterionId_idx" ON "EvidenceAllocation"("assessmentId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceAllocation_evidenceId_periodId_key" ON "EvidenceAllocation"("evidenceId", "periodId");

-- CreateIndex
CREATE INDEX "Appeal_assessmentId_idx" ON "Appeal"("assessmentId");

-- CreateIndex
CREATE INDEX "PromotionRecommendation_employeeId_status_idx" ON "PromotionRecommendation"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CareerLevelHistory_promotionId_key" ON "CareerLevelHistory"("promotionId");

-- CreateIndex
CREATE INDEX "CareerLevelHistory_employeeId_effectiveFrom_idx" ON "CareerLevelHistory"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "HiringDecision_candidateId_createdAt_idx" ON "HiringDecision"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "CompensationRecommendation_employeeId_idx" ON "CompensationRecommendation"("employeeId");

-- CreateIndex
CREATE INDEX "CompensationRecommendation_candidateId_idx" ON "CompensationRecommendation"("candidateId");

-- CreateIndex
CREATE INDEX "DevelopmentItem_employeeId_status_idx" ON "DevelopmentItem"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RewardBudget_policyId_periodId_key" ON "RewardBudget"("policyId", "periodId");

-- CreateIndex
CREATE INDEX "RewardRecommendation_periodId_status_idx" ON "RewardRecommendation"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRecommendation_employeeId_periodId_policyId_key" ON "RewardRecommendation"("employeeId", "periodId", "policyId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_entityType_entityId_createdAt_idx" ON "AuditEvent"("orgId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_createdAt_idx" ON "AuditEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_assessmentId_purpose_createdAt_idx" ON "AiRun"("assessmentId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceDocument_storageKey_key" ON "ReferenceDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_orgId_provider_key" ON "CrmConnection"("orgId", "provider");

-- CreateIndex
CREATE INDEX "ExternalMapping_entityType_internalId_idx" ON "ExternalMapping"("entityType", "internalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMapping_connectionId_entityType_externalId_key" ON "ExternalMapping"("connectionId", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "ImportBatch_orgId_sha256_idx" ON "ImportBatch"("orgId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialty" ADD CONSTRAINT "Specialty_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competency" ADD CONSTRAINT "Competency_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerLevel" ADD CONSTRAINT "CareerLevel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelRequirement" ADD CONSTRAINT "LevelRequirement_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CareerLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelRequirement" ADD CONSTRAINT "LevelRequirement_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelRequirement" ADD CONSTRAINT "LevelRequirement_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryBand" ADD CONSTRAINT "SalaryBand_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryBand" ADD CONSTRAINT "SalaryBand_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricVersion" ADD CONSTRAINT "RubricVersion_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricVersion" ADD CONSTRAINT "RubricVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_currentLevelId_fkey" FOREIGN KEY ("currentLevelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_fromCandidateId_fkey" FOREIGN KEY ("fromCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformancePeriod" ADD CONSTRAINT "PerformancePeriod_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentInvite" ADD CONSTRAINT "AssessmentInvite_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentInvite" ADD CONSTRAINT "AssessmentInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResponse" ADD CONSTRAINT "CandidateResponse_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResponse" ADD CONSTRAINT "CandidateResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAttachment" ADD CONSTRAINT "EvidenceAttachment_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAllocation" ADD CONSTRAINT "EvidenceAllocation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAllocation" ADD CONSTRAINT "EvidenceAllocation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAllocation" ADD CONSTRAINT "EvidenceAllocation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAllocation" ADD CONSTRAINT "EvidenceAllocation_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_fromLevelId_fkey" FOREIGN KEY ("fromLevelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_toLevelId_fkey" FOREIGN KEY ("toLevelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_recommendedById_fkey" FOREIGN KEY ("recommendedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerLevelHistory" ADD CONSTRAINT "CareerLevelHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerLevelHistory" ADD CONSTRAINT "CareerLevelHistory_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerLevelHistory" ADD CONSTRAINT "CareerLevelHistory_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "PromotionRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringDecision" ADD CONSTRAINT "HiringDecision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringDecision" ADD CONSTRAINT "HiringDecision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringDecision" ADD CONSTRAINT "HiringDecision_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringDecision" ADD CONSTRAINT "HiringDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_salaryBandId_fkey" FOREIGN KEY ("salaryBandId") REFERENCES "SalaryBand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentItem" ADD CONSTRAINT "DevelopmentItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentItem" ADD CONSTRAINT "DevelopmentItem_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentItem" ADD CONSTRAINT "DevelopmentItem_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPolicy" ADD CONSTRAINT "RewardPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPolicy" ADD CONSTRAINT "RewardPolicy_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPolicy" ADD CONSTRAINT "RewardPolicy_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardBudget" ADD CONSTRAINT "RewardBudget_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RewardPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardBudget" ADD CONSTRAINT "RewardBudget_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RewardPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_paidMarkedById_fkey" FOREIGN KEY ("paidMarkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceDocument" ADD CONSTRAINT "ReferenceDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmConnection" ADD CONSTRAINT "CrmConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMapping" ADD CONSTRAINT "ExternalMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
