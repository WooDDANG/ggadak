/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { V1DecisionController } from './../../controllers/v1-decision.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PolicyController } from './../../controllers/policy.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FeedbackController } from './../../controllers/feedback.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DiscussionController } from './../../controllers/discussion.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DecisionController } from './../../controllers/decision.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CheckpointController } from './../../controllers/checkpoint.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuthController } from './../../controllers/auth.controller.js';
import { expressAuthentication } from './../../authentication.js';
// @ts-ignore - no great way to install types from subpackage
import { iocContainer } from './../../../loaders/ioc.js';
import type { IocContainer, IocContainerFactory } from '@tsoa/runtime';
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "DecisionStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["IN_REVIEW"]},{"dataType":"enum","enums":["CONFIRMED"]},{"dataType":"enum","enums":["ON_HOLD"]},{"dataType":"enum","enums":["DISCARDED"]},{"dataType":"enum","enums":["SUPERSEDED"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActionItemDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string"},
            "state": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unknown"]},{"dataType":"enum","enums":["open"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["canceled"]},{"dataType":"enum","enums":["transferred"]}]},
            "transferredFromDecisionId": {"dataType":"string"},
            "transferredFromActionItemId": {"dataType":"string"},
            "transferredToDecisionId": {"dataType":"string"},
            "task": {"dataType":"string","required":true},
            "assignee": {"dataType":"string"},
            "dueDate": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_DecisionItemDto.Exclude_keyofDecisionItemDto.alternatives__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"id":{"dataType":"string","required":true},"version":{"dataType":"double"},"supersededById":{"dataType":"string"},"topic":{"dataType":"string","required":true},"decision":{"dataType":"string","required":true},"title":{"dataType":"string"},"decisionContent":{"dataType":"string"},"rationale":{"dataType":"string","required":true},"rationaleSummary":{"dataType":"string"},"rationaleQuotes":{"dataType":"array","array":{"dataType":"string"}},"categoryTag":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["타깃"]},{"dataType":"enum","enums":["문제정의"]},{"dataType":"enum","enums":["기능"]},{"dataType":"enum","enums":["기술"]},{"dataType":"enum","enums":["BM"]},{"dataType":"enum","enums":["기타"]}]},"actionItems":{"dataType":"array","array":{"dataType":"refObject","ref":"ActionItemDto"}},"state":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Draft"]},{"dataType":"enum","enums":["Proposed"]},{"dataType":"enum","enums":["Discussing"]},{"dataType":"enum","enums":["Decided"]},{"dataType":"enum","enums":["Superseded"]},{"dataType":"enum","enums":["Deferred"]},{"dataType":"enum","enums":["Rejected"]}],"required":true},"supersedesId":{"dataType":"string"},"isPivot":{"dataType":"boolean"},"approvedBy":{"dataType":"string"},"decisionConfirmedDate":{"dataType":"string"},"feedbackSourceType":{"dataType":"string"},"feedbackSourceDetail":{"dataType":"string"},"feedbackReceivedDate":{"dataType":"string"},"rawEvidence":{"dataType":"array","array":{"dataType":"string"}},"evidenceHash":{"dataType":"string"},"rawTranscript":{"dataType":"string"},"source":{"ref":"Record_string.any_"},"messageCreatedAt":{"dataType":"string"},"createdAt":{"dataType":"string","required":true},"governanceScore":{"dataType":"double"},"governanceReason":{"dataType":"string"},"governancePassed":{"dataType":"boolean"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "V1DecisionDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "version": {"dataType":"double"},
            "supersededById": {"dataType":"string"},
            "topic": {"dataType":"string","required":true},
            "decision": {"dataType":"string","required":true},
            "title": {"dataType":"string"},
            "decisionContent": {"dataType":"string"},
            "rationale": {"dataType":"string","required":true},
            "rationaleSummary": {"dataType":"string"},
            "rationaleQuotes": {"dataType":"array","array":{"dataType":"string"}},
            "categoryTag": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["타깃"]},{"dataType":"enum","enums":["문제정의"]},{"dataType":"enum","enums":["기능"]},{"dataType":"enum","enums":["기술"]},{"dataType":"enum","enums":["BM"]},{"dataType":"enum","enums":["기타"]}]},
            "actionItems": {"dataType":"array","array":{"dataType":"refObject","ref":"ActionItemDto"}},
            "state": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Draft"]},{"dataType":"enum","enums":["Proposed"]},{"dataType":"enum","enums":["Discussing"]},{"dataType":"enum","enums":["Decided"]},{"dataType":"enum","enums":["Superseded"]},{"dataType":"enum","enums":["Deferred"]},{"dataType":"enum","enums":["Rejected"]}],"required":true},
            "supersedesId": {"dataType":"string"},
            "isPivot": {"dataType":"boolean"},
            "approvedBy": {"dataType":"string"},
            "decisionConfirmedDate": {"dataType":"string"},
            "feedbackSourceType": {"dataType":"string"},
            "feedbackSourceDetail": {"dataType":"string"},
            "feedbackReceivedDate": {"dataType":"string"},
            "rawEvidence": {"dataType":"array","array":{"dataType":"string"}},
            "evidenceHash": {"dataType":"string"},
            "rawTranscript": {"dataType":"string"},
            "source": {"ref":"Record_string.any_"},
            "messageCreatedAt": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
            "governanceScore": {"dataType":"double"},
            "governanceReason": {"dataType":"string"},
            "governancePassed": {"dataType":"boolean"},
            "updatedAt": {"dataType":"string"},
            "status": {"ref":"DecisionStatus","required":true},
            "category": {"dataType":"string","required":true},
            "confirmedDate": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "dates": {"dataType":"nestedObjectLiteral","nestedProperties":{"feedbackDate":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"confirmedDate":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"createdDate":{"dataType":"string","required":true}},"required":true},
            "alternatives": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_V1DecisionDto_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"V1DecisionDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DecisionEditDto": {
        "dataType": "refObject",
        "properties": {
            "expectedVersion": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "decision": {"dataType":"string","required":true},
            "rationale": {"dataType":"string","required":true},
            "category": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["타깃"]},{"dataType":"enum","enums":["문제정의"]},{"dataType":"enum","enums":["기능"]},{"dataType":"enum","enums":["기술"]},{"dataType":"enum","enums":["BM"]},{"dataType":"enum","enums":["기타"]}],"required":true},
            "alternatives": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string"}}},"required":true},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AlternativeItemDto": {
        "dataType": "refObject",
        "properties": {
            "option": {"dataType":"string","required":true},
            "reason": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DecisionItemDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "version": {"dataType":"double"},
            "supersededById": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "topic": {"dataType":"string","required":true},
            "decision": {"dataType":"string","required":true},
            "title": {"dataType":"string"},
            "decisionContent": {"dataType":"string"},
            "rationale": {"dataType":"string","required":true},
            "rationaleSummary": {"dataType":"string"},
            "rationaleQuotes": {"dataType":"array","array":{"dataType":"string"}},
            "alternatives": {"dataType":"array","array":{"dataType":"refObject","ref":"AlternativeItemDto"}},
            "categoryTag": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["타깃"]},{"dataType":"enum","enums":["문제정의"]},{"dataType":"enum","enums":["기능"]},{"dataType":"enum","enums":["기술"]},{"dataType":"enum","enums":["BM"]},{"dataType":"enum","enums":["기타"]}]},
            "actionItems": {"dataType":"array","array":{"dataType":"refObject","ref":"ActionItemDto"}},
            "state": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Draft"]},{"dataType":"enum","enums":["Proposed"]},{"dataType":"enum","enums":["Discussing"]},{"dataType":"enum","enums":["Decided"]},{"dataType":"enum","enums":["Superseded"]},{"dataType":"enum","enums":["Deferred"]},{"dataType":"enum","enums":["Rejected"]}],"required":true},
            "supersedesId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "isPivot": {"dataType":"union","subSchemas":[{"dataType":"boolean"},{"dataType":"enum","enums":[null]}]},
            "approvedBy": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "decisionConfirmedDate": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "feedbackSourceType": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "feedbackSourceDetail": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "feedbackReceivedDate": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "rawEvidence": {"dataType":"array","array":{"dataType":"string"}},
            "evidenceHash": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "rawTranscript": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "source": {"ref":"Record_string.any_"},
            "messageCreatedAt": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "createdAt": {"dataType":"string","required":true},
            "governanceScore": {"dataType":"double"},
            "governanceReason": {"dataType":"string"},
            "governancePassed": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "V1DecisionListDto": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"V1DecisionDto"},"required":true},
            "decisions": {"dataType":"array","array":{"dataType":"refObject","ref":"DecisionItemDto"},"required":true},
            "pageInfo": {"dataType":"nestedObjectLiteral","nestedProperties":{"totalPages":{"dataType":"double","required":true},"totalElements":{"dataType":"double","required":true},"pageSize":{"dataType":"double","required":true},"currentPage":{"dataType":"double","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_V1DecisionListDto_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"V1DecisionListDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HarvestingPolicyDto": {
        "dataType": "refObject",
        "properties": {
            "initialScanLimit": {"dataType":"double","required":true},
            "contextWindowBefore": {"dataType":"double","required":true},
            "contextWindowAfter": {"dataType":"double","required":true},
            "maxMergedWindow": {"dataType":"double","required":true},
            "reactionThreshold": {"dataType":"double","required":true},
            "debounceMs": {"dataType":"double","required":true},
            "agreementThreshold": {"dataType":"double","required":true},
            "lookbackDays": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FeedbackSourceType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["교수"]},{"dataType":"enum","enums":["심사위원"]},{"dataType":"enum","enums":["팀원"]},{"dataType":"enum","enums":["인터뷰이"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ExternalFeedbackItemDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "source": {"ref":"FeedbackSourceType","required":true},
            "detail": {"dataType":"string"},
            "content": {"dataType":"string","required":true},
            "channelId": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FeedbackListResponseDto": {
        "dataType": "refObject",
        "properties": {
            "feedbacks": {"dataType":"array","array":{"dataType":"refObject","ref":"ExternalFeedbackItemDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateFeedbackDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "source": {"ref":"FeedbackSourceType","required":true},
            "detail": {"dataType":"string"},
            "content": {"dataType":"string","required":true},
            "channelId": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CandidateHistoryEntry": {
        "dataType": "refObject",
        "properties": {
            "requestId": {"dataType":"string","required":true},
            "isManualOverride": {"dataType":"boolean","required":true},
            "previousRequestIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "relatedCandidateIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnalyzeDiscussionResponseDto": {
        "dataType": "refObject",
        "properties": {
            "found": {"dataType":"boolean","required":true},
            "summary": {"dataType":"string","required":true},
            "decisions": {"dataType":"array","array":{"dataType":"refObject","ref":"DecisionItemDto"},"required":true},
            "hasConflict": {"dataType":"boolean"},
            "conflictingDecision": {"ref":"DecisionItemDto"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RawMessageItemDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string"},
            "author": {"dataType":"string","required":true},
            "content": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string"},
            "replyingTo": {"dataType":"string"},
            "reactionCount": {"dataType":"double"},
            "reactions": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"emoji":{"dataType":"string","required":true}}}},
            "isTrigger": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnalyzeDiscussionRequestDto": {
        "dataType": "refObject",
        "properties": {
            "requestId": {"dataType":"string","required":true},
            "rawMessages": {"dataType":"array","array":{"dataType":"refObject","ref":"RawMessageItemDto"},"required":true},
            "guildId": {"dataType":"string"},
            "channelId": {"dataType":"string"},
            "channelName": {"dataType":"string"},
            "triggerMessageId": {"dataType":"string"},
            "messageUrl": {"dataType":"string"},
            "isManualOverride": {"dataType":"boolean"},
            "traceId": {"dataType":"string"},
            "score": {"dataType":"double"},
            "participantCount": {"dataType":"double"},
            "reactionsCount": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DecisionListResponseDto": {
        "dataType": "refObject",
        "properties": {
            "decisions": {"dataType":"array","array":{"dataType":"refObject","ref":"DecisionItemDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReviewDecisionResponseDto": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"enum","enums":["ok"],"required":true},
            "decision": {"ref":"DecisionItemDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReviewDecisionDto": {
        "dataType": "refObject",
        "properties": {
            "action": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["confirm"]},{"dataType":"enum","enums":["defer"]},{"dataType":"enum","enums":["reject"]},{"dataType":"enum","enums":["edit"]}],"required":true},
            "expectedVersion": {"dataType":"double","required":true},
            "resolution": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["independent"]},{"dataType":"enum","enums":["replace"]}]},
            "predecessorId": {"dataType":"string"},
            "predecessorVersion": {"dataType":"double"},
            "taskDispositions": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"disposition":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["cancel"]},{"dataType":"enum","enums":["transfer"]}]},"classification":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["open"]},{"dataType":"enum","enums":["completed"]}]},"actionItemId":{"dataType":"string","required":true}}}},
            "rationaleSummary": {"dataType":"string"},
            "rationaleQuotes": {"dataType":"array","array":{"dataType":"string"}},
            "approvedBy": {"dataType":"string"},
            "title": {"dataType":"string"},
            "decisionContent": {"dataType":"string"},
            "rationale": {"dataType":"string"},
            "categoryTag": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["타깃"]},{"dataType":"enum","enums":["문제정의"]},{"dataType":"enum","enums":["기능"]},{"dataType":"enum","enums":["기술"]},{"dataType":"enum","enums":["BM"]},{"dataType":"enum","enums":["기타"]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResolveConflictDto": {
        "dataType": "refObject",
        "properties": {
            "decisionId": {"dataType":"string","required":true},
            "conflictingId": {"dataType":"string","required":true},
            "resolution": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["supersede"]},{"dataType":"enum","enums":["coexist"]}],"required":true},
            "expectedVersion": {"dataType":"double","required":true},
            "predecessorVersion": {"dataType":"double"},
            "taskDispositions": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"disposition":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["cancel"]},{"dataType":"enum","enums":["transfer"]}]},"classification":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["open"]},{"dataType":"enum","enums":["completed"]}]},"actionItemId":{"dataType":"string","required":true}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DecisionWebhookDto": {
        "dataType": "refObject",
        "properties": {
            "event": {"dataType":"string","required":true},
            "payload": {"dataType":"any","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckpointResponseDto": {
        "dataType": "refObject",
        "properties": {
            "channelId": {"dataType":"string","required":true},
            "lastMessageId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SaveCheckpointDto": {
        "dataType": "refObject",
        "properties": {
            "lastMessageId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__url-string__": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"url":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthUser": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "email": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "avatarUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "discordUserId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__accessToken-string--tokenType-string--expiresAt-string--user-AuthUser__": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"user":{"ref":"AuthUser","required":true},"expiresAt":{"dataType":"string","required":true},"tokenType":{"dataType":"string","required":true},"accessToken":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_AuthUser_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"AuthUser","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DiscordGuild": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "icon": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "owner": {"dataType":"boolean","required":true},
            "permissions": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__guilds-DiscordGuild-Array__": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"guilds":{"dataType":"array","array":{"dataType":"refObject","ref":"DiscordGuild"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__accessToken-string--tokenType-string--expiresAt-string__": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"expiresAt":{"dataType":"string","required":true},"tokenType":{"dataType":"string","required":true},"accessToken":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_null_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"enum","enums":[null],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"silently-remove-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
        const argsV1DecisionController_editV1Decision: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                guildId: {"in":"query","name":"guildId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"DecisionEditDto"},
        };
        app.put('/api/v1/decisions/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(V1DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(V1DecisionController.prototype.editV1Decision)),

            async function V1DecisionController_editV1Decision(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsV1DecisionController_editV1Decision, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<V1DecisionController>(V1DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'editV1Decision',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsV1DecisionController_getV1Decision: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                guildId: {"in":"query","name":"guildId","required":true,"dataType":"string"},
        };
        app.get('/api/v1/decisions/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(V1DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(V1DecisionController.prototype.getV1Decision)),

            async function V1DecisionController_getV1Decision(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsV1DecisionController_getV1Decision, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<V1DecisionController>(V1DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getV1Decision',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsV1DecisionController_listV1Decisions: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                guildId: {"in":"query","name":"guildId","required":true,"dataType":"string"},
                topic: {"in":"query","name":"topic","dataType":"string"},
                state: {"in":"query","name":"state","dataType":"string"},
                categoryTag: {"in":"query","name":"categoryTag","dataType":"string"},
                status: {"in":"query","name":"status","ref":"DecisionStatus"},
                category: {"in":"query","name":"category","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                size: {"default":20,"in":"query","name":"size","dataType":"double"},
        };
        app.get('/api/v1/decisions',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(V1DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(V1DecisionController.prototype.listV1Decisions)),

            async function V1DecisionController_listV1Decisions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsV1DecisionController_listV1Decisions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<V1DecisionController>(V1DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listV1Decisions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPolicyController_get: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/config/policy',
            ...(fetchMiddlewares<RequestHandler>(PolicyController)),
            ...(fetchMiddlewares<RequestHandler>(PolicyController.prototype.get)),

            async function PolicyController_get(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPolicyController_get, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PolicyController>(PolicyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'get',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFeedbackController_listFeedbacks: Record<string, TsoaRoute.ParameterSchema> = {
                channelId: {"in":"query","name":"channelId","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/feedbacks',
            ...(fetchMiddlewares<RequestHandler>(FeedbackController)),
            ...(fetchMiddlewares<RequestHandler>(FeedbackController.prototype.listFeedbacks)),

            async function FeedbackController_listFeedbacks(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeedbackController_listFeedbacks, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FeedbackController>(FeedbackController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listFeedbacks',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFeedbackController_createFeedback: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateFeedbackDto"},
        };
        app.post('/api/feedbacks',
            ...(fetchMiddlewares<RequestHandler>(FeedbackController)),
            ...(fetchMiddlewares<RequestHandler>(FeedbackController.prototype.createFeedback)),

            async function FeedbackController_createFeedback(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeedbackController_createFeedback, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FeedbackController>(FeedbackController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createFeedback',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDiscussionController_history: Record<string, TsoaRoute.ParameterSchema> = {
                decisionId: {"in":"path","name":"decisionId","required":true,"dataType":"string"},
        };
        app.get('/api/discussions/history/:decisionId',
            ...(fetchMiddlewares<RequestHandler>(DiscussionController)),
            ...(fetchMiddlewares<RequestHandler>(DiscussionController.prototype.history)),

            async function DiscussionController_history(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDiscussionController_history, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DiscussionController>(DiscussionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'history',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDiscussionController_analyze: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"AnalyzeDiscussionRequestDto"},
                traceIdHeader: {"in":"header","name":"X-Trace-Id","dataType":"string"},
        };
        app.post('/api/discussions/analyze',
            ...(fetchMiddlewares<RequestHandler>(DiscussionController)),
            ...(fetchMiddlewares<RequestHandler>(DiscussionController.prototype.analyze)),

            async function DiscussionController_analyze(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDiscussionController_analyze, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DiscussionController>(DiscussionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'analyze',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionController_listDecisions: Record<string, TsoaRoute.ParameterSchema> = {
                topic: {"in":"query","name":"topic","dataType":"string"},
                state: {"in":"query","name":"state","dataType":"string"},
                categoryTag: {"in":"query","name":"categoryTag","dataType":"string"},
        };
        app.get('/api/decisions',
            ...(fetchMiddlewares<RequestHandler>(DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionController.prototype.listDecisions)),

            async function DecisionController_listDecisions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionController_listDecisions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DecisionController>(DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listDecisions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionController_review: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ReviewDecisionDto"},
        };
        app.post('/api/decisions/:id/review',
            ...(fetchMiddlewares<RequestHandler>(DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionController.prototype.review)),

            async function DecisionController_review(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionController_review, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DecisionController>(DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'review',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionController_resolve: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"ResolveConflictDto"},
        };
        app.post('/api/decisions/conflict',
            ...(fetchMiddlewares<RequestHandler>(DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionController.prototype.resolve)),

            async function DecisionController_resolve(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionController_resolve, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DecisionController>(DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'resolve',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionController_webhook: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"DecisionWebhookDto"},
        };
        app.post('/api/webhooks/decisions',
            ...(fetchMiddlewares<RequestHandler>(DecisionController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionController.prototype.webhook)),

            async function DecisionController_webhook(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionController_webhook, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DecisionController>(DecisionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'webhook',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCheckpointController_getByChannelId: Record<string, TsoaRoute.ParameterSchema> = {
                channelId: {"in":"path","name":"channelId","required":true,"dataType":"string"},
        };
        app.get('/api/channels/:channelId/checkpoint',
            ...(fetchMiddlewares<RequestHandler>(CheckpointController)),
            ...(fetchMiddlewares<RequestHandler>(CheckpointController.prototype.getByChannelId)),

            async function CheckpointController_getByChannelId(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckpointController_getByChannelId, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CheckpointController>(CheckpointController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getByChannelId',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCheckpointController_save: Record<string, TsoaRoute.ParameterSchema> = {
                channelId: {"in":"path","name":"channelId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"SaveCheckpointDto"},
        };
        app.post('/api/channels/:channelId/checkpoint',
            ...(fetchMiddlewares<RequestHandler>(CheckpointController)),
            ...(fetchMiddlewares<RequestHandler>(CheckpointController.prototype.save)),

            async function CheckpointController_save(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckpointController_save, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CheckpointController>(CheckpointController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'save',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_authorizeDiscord: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/auth/authorize',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.authorizeDiscord)),

            async function AuthController_authorizeDiscord(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_authorizeDiscord, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuthController>(AuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'authorizeDiscord',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_loginDiscord: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"state":{"dataType":"string","required":true},"code":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/auth/login',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.loginDiscord)),

            async function AuthController_loginDiscord(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_loginDiscord, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuthController>(AuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'loginDiscord',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_getCurrentUser: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/auth/me',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.getCurrentUser)),

            async function AuthController_getCurrentUser(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_getCurrentUser, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuthController>(AuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCurrentUser',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_listAuthGuilds: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/auth/guilds',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.listAuthGuilds)),

            async function AuthController_listAuthGuilds(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_listAuthGuilds, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuthController>(AuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listAuthGuilds',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_refreshSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/auth/refresh',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.refreshSession)),

            async function AuthController_refreshSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_refreshSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuthController>(AuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'refreshSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_logoutSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/auth/logout',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.logoutSession)),

            async function AuthController_logoutSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_logoutSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuthController>(AuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'logoutSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(request: any, response: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }

                    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            try {
                request['user'] = await Promise.any(secMethodOrPromises);

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }

                next();
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                error.status = error.status || 401;

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }
                next(error);
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
