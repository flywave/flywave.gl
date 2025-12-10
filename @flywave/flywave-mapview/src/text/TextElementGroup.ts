/* Copyright (C) 2025 flywave.gl contributors */

import { PriorityListGroup } from "@flywave/flywave-utils";

import { type TextElement } from "./TextElement";

/**
 * Group of {@link TextElement} sharing same priority.
 */
export class TextElementGroup extends PriorityListGroup<TextElement> {}
