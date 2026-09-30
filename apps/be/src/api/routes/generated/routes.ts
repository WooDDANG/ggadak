/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
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
import { iocContainer } from './../../../loaders/ioc.js';
import type { IocContainer, IocContainerFactory } from '@tsoa/runtime';
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';



// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
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
    "AlternativeItemDto": {
        "dataType": "refObject",
        "properties": {
            "option": {"dataType":"string","required":true},
            "reason": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActionItemDto": {
        "dataType": "refObject",
        "properties": {
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
    "DecisionItemDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "topic": {"dataType":"string","required":true},
            "decision": {"dataType":"string","required":true},
            "title": {"dataType":"string"},
            "decisionContent": {"dataType":"string"},
            "rationale": {"dataType":"string","required":true},
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
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnalyzeDiscussionRequestDto": {
        "dataType": "refObject",
        "properties": {
            "rawMessages": {"dataType":"array","array":{"dataType":"refObject","ref":"RawMessageItemDto"},"required":true},
            "guildId": {"dataType":"string"},
            "channelId": {"dataType":"string"},
            "channelName": {"dataType":"string"},
            "triggerMessageId": {"dataType":"string"},
            "messageUrl": {"dataType":"string"},
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
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"silently-remove-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
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
        const argsDiscussionController_analyze: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"AnalyzeDiscussionRequestDto"},
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

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
