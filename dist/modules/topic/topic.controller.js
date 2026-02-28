"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopicController = exports.updateTopicController = exports.listTopicsController = exports.bunnyWebhookController = exports.getPlaybackController = exports.createTopicController = void 0;
const svc = __importStar(require("./topic.service"));
const topic_schema_1 = require("./topic.schema");
const asyncHandler_1 = require("../../utils/asyncHandler");
exports.createTopicController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { moduleId } = topic_schema_1.moduleParamsSchema.parse(req.params);
    const body = topic_schema_1.createTopicSchema.parse(req.body);
    const topic = await svc.createTopic(moduleId, body);
    res.status(201).json({ success: true, data: topic });
});
/* -------- GET SIGNED PLAYBACK -------- */
exports.getPlaybackController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = topic_schema_1.topicParamsSchema.parse(req.params);
    const url = await svc.generateSignedPlaybackUrl(id, req.user.id);
    res.json({
        success: true,
        playbackUrl: url,
    });
});
/* -------- BUNNY WEBHOOK -------- */
exports.bunnyWebhookController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    // const signature = req.headers["bunny-signature"] as string;
    // if (!signature) {
    //   return res.status(400).send("Missing signature");
    // }
    // const isValid = svc.verifyBunnyWebhookSignature(
    //   req.body as Buffer,
    //   signature,
    // );
    // if (!isValid) {
    //   return res.status(401).send("Invalid signature");
    // }
    // const payload = JSON.parse(req.body.toString());
    // await svc.handleBunnyWebhook(payload);
    await svc.handleBunnyWebhook(req.body);
    res.status(200).send("OK");
});
exports.listTopicsController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { moduleId } = topic_schema_1.moduleParamsSchema.parse(req.params);
    const topics = await svc.listTopicsForModule(moduleId);
    res.json({ success: true, data: topics });
});
exports.updateTopicController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = topic_schema_1.updateTopicSchema.parse(req.body);
    const updated = await svc.updateTopic(req.params.id, body);
    res.json({ success: true, topic: updated });
});
exports.deleteTopicController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await svc.deleteTopic(req.params.id);
    res.json({ success: true, message: "Topic deleted" });
});
