/**
 * flywave.gl token configuration file
 * Unified management of all access tokens
 */

// Cesium Ion access token
export const CESIUM_ION_TOKEN = 
  typeof process !== 'undefined' && process.env?.CESIUM_ION_TOKEN 
    ? process.env.CESIUM_ION_TOKEN 
    : typeof window !== 'undefined' && (window as any).CESIUM_ION_TOKEN
      ? (window as any).CESIUM_ION_TOKEN
      : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTFkYWMzNC1mYjI1LTRlYTYtYTc2ZS04NWI1MTU2OTVlMDYiLCJpZCI6Mzg2NzksImlhdCI6MTY0MTE5NTAyNn0.4xsIJgYTK81yhRu67GG0x2FMit6zpYFCWsvWSwiFVV4';

// Other possible configuration items can be added here