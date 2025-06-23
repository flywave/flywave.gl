export interface Description {
    version: number;
}

export abstract class LoaderBase<MagicDescriptionData extends Description> {
    public fetchOptions: RequestInit;
    public workingPath: string;

    constructor() {
        this.fetchOptions = {};
        this.workingPath = "";
    }

    public load(url: string): Promise<MagicDescriptionData> {
        return fetch(url, this.fetchOptions)
            .then((res: Response) => {
                if (!res.ok) {
                    throw new Error(
                        `Failed to load file "${url}" with status ${res.status} : ${res.statusText}`
                    );
                }
                return res.arrayBuffer();
            })
            .then((buffer: ArrayBuffer) => {
                if (this.workingPath === "") {
                    this.workingPath = this.workingPathForURL(url);
                }
                return this.parse(buffer);
            });
    }

    public resolveExternalURL(url: string): string {
        if (/^[^\\/]/.test(url)) {
            return this.workingPath + "/" + url;
        } else {
            return url;
        }
    }

    public workingPathForURL(url: string): string {
        const splits = url.split(/[\\/]/g);
        splits.pop();
        const workingPath = splits.join("/");
        return workingPath + "/";
    }

    public abstract parse(buffer: ArrayBuffer): Promise<MagicDescriptionData>;
}
