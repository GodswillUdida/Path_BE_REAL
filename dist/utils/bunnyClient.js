"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bunnyFetch = void 0;
const bunnyFetch = async (url, options) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Bunny API error: ${response.status}`);
        }
        return response.json();
    }
    finally {
        clearTimeout(timeout);
    }
};
exports.bunnyFetch = bunnyFetch;
