/*
 * Entry for the karma decoder worker bundle. Registers the MBStyle decoder
 * service so MBStyleDataSource can decode tiles in a real Web Worker.
 */
import { startMBStyleDecoderService } from "@flywave/flywave-mbstyle-datasource/src/index-worker";

startMBStyleDecoderService();
