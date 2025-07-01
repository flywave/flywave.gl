/**
 * This enumerated type is used to determine how the vertices of the terrain mesh are compressed.
 */
enum TerrainQuantization {
    /**
     * The vertices are not compressed.
     */
    NONE = 0,

    /**
     * The vertices are compressed to 12 bits.
     */
    BITS12 = 1
}

export default TerrainQuantization;
