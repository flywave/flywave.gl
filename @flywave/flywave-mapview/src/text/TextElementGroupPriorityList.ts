/* Copyright (C) 2025 flywave.gl contributors */

import { GroupedPriorityList } from "@flywave/flywave-utils";

import { type TextElement } from "./TextElement";

/**
 * List of {@link TextElement} groups sorted by priority.
 */
export class TextElementGroupPriorityList extends GroupedPriorityList<TextElement> {}
