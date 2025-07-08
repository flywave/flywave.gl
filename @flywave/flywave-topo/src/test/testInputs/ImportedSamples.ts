
import * as fs from "fs";
import { GeometryQuery } from "../../curve/geometry-query";
import { IndexedPolyface } from "../../polyface/polyface";
import { IModelJson } from "../../serialization/json-schema";

/**
 * `ImportedSample` has static methods to create a variety of geometry samples useful in testing.
 * @alpha
 */
 export class ImportedSample {
  // cspell:word rhombicosidodecahedron
  /** Create a 62-sided regular polyhedron mesh with 3-, 4-, and 5-sided faces and vertex color data. */
  public static createPolyhedron62(): IndexedPolyface | undefined {
    const json = fs.readFileSync("./src/test/testInputs/polyface/rhombicosidodecahedron.imjs", "utf8");
    const inputs = IModelJson.Reader.parse(JSON.parse(json)) as GeometryQuery[];
    for (const mesh of inputs) {
      if (undefined !== mesh && mesh instanceof IndexedPolyface)
        return mesh;
    }
    return undefined;
  }
}
