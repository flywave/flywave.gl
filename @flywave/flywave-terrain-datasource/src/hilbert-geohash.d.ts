declare module '@vitaly-z/hilbert-geohash' {
    export function encode(lat: number, lon: number): string;
    export function decode(hash: string): { lat: number; lon: number };
}