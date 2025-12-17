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
exports.deleteModuleController = exports.updateModuleController = exports.listModulesController = exports.createModuleController = void 0;
const svc = __importStar(require("./module.service"));
const module_schema_1 = require("./module.schema");
const createModuleController = async (req, res) => {
    const body = module_schema_1.createModuleSchema.parse(req.body);
    const mod = await svc.createModule({ ...body, description: body.description ?? undefined });
    res.status(201).json({ success: true, module: mod });
};
exports.createModuleController = createModuleController;
const listModulesController = async (req, res) => {
    const courseId = req.params.courseId;
    const list = await svc.listModulesForCourse(courseId);
    res.json({ success: true, modules: list });
};
exports.listModulesController = listModulesController;
const updateModuleController = async (req, res) => {
    const body = module_schema_1.updateModuleSchema.parse(req.body);
    const updated = await svc.updateModule(req.params.id, {
        description: body.description ?? undefined,
    });
    res.json({ success: true, module: updated });
};
exports.updateModuleController = updateModuleController;
const deleteModuleController = async (req, res) => {
    await svc.deleteModule(req.params.id);
    res.json({ success: true, message: "Module removed" });
};
exports.deleteModuleController = deleteModuleController;
