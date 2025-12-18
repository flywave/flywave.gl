/* Copyright (C) 2025 flywave.gl contributors */

type ExampleDefinitions = Record<string, string>;

/**
 * Example browser HTML / DOM app.
 */
function exampleBrowser(exampleDefinitions: ExampleDefinitions) {
    const navPanel = document.getElementById("navPanel") as HTMLDivElement;
    const exampleFrameElement = document.getElementById("exampleFrame") as HTMLIFrameElement;
    const exampleListElement = document.getElementById("exampleList") as HTMLDivElement;

    let currentlySelectedSource: string | undefined;
    const categories: Record<string, HTMLElement[]> = {};
    const orderedCategories: string[] = [
        "Getting started",
        "Datasource",
        "Rendering",
        "Styling",
        "Threejs",
        "Miscellaneous"
    ];
    const elements: HTMLAnchorElement[] = [];
    const titleElements: HTMLElement[] = [];

    /**
     * Query params parsed out of hash.
     *
     * Used by xyz example to reload with params while keeping internal state.
     */
    let queryParams = "";

    installHamburgerHandler();
    populateExamplesMenu();

    installFilter(document.getElementById("filterInput") as HTMLInputElement);

    function installHamburgerHandler() {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;
        const closeButton = document.getElementById("closeButton") as HTMLButtonElement;

        expandButton.addEventListener("click", event => {
            navPanel.classList.toggle("collapsed");
            // Adjust iframe position based on sidebar state
            if (navPanel.classList.contains("collapsed")) {
                exampleFrameElement.style.left = "0";
                exampleFrameElement.style.width = "100%";
            } else {
                exampleFrameElement.style.left = "var(--sidebar-width)";
                exampleFrameElement.style.width = "calc(100% - var(--sidebar-width))";
            }
            event.preventDefault();
        });
        closeButton.addEventListener("click", event => {
            navPanel.classList.toggle("collapsed");
            // Adjust iframe position based on sidebar state
            if (navPanel.classList.contains("collapsed")) {
                exampleFrameElement.style.left = "0";
                exampleFrameElement.style.width = "100%";
            } else {
                exampleFrameElement.style.left = "var(--sidebar-width)";
                exampleFrameElement.style.width = "calc(100% - var(--sidebar-width))";
            }
            event.preventDefault();
        });
    }

    /**
     * Dynamically import thumbnail using Webpack's dynamic import
     * This ensures images are properly bundled and available after build
     */
    async function loadThumbnail(thumbnail: HTMLDivElement, exampleName: string): Promise<void> {
        // Add loading class initially
        thumbnail.classList.add('loading');
        
        try {
            // Try to dynamically import the thumbnail image
            // Webpack will handle bundling these assets correctly
            const thumbnailModule = await import(`./src/${exampleName}/thumbnail.png`);
            thumbnail.style.backgroundImage = `url('${thumbnailModule.default}')`;
            thumbnail.classList.remove('loading');
            thumbnail.classList.add('loaded');
        } catch (error) {
            // If the specific thumbnail doesn't exist, try a fallback
            try {
                thumbnail.classList.remove('loading');
                thumbnail.classList.add('loaded', 'fallback');
            } catch (fallbackError) {
                // If no thumbnails available, show error state
                thumbnail.classList.remove('loading');
                thumbnail.classList.add('error');
            }
        }
    }

    function populateExamplesMenu() {
        Object.keys(exampleDefinitions)
            .sort()
            .forEach(pageUrl => {
                const linkName = getName(pageUrl).replace(new RegExp("-", "g"), " ");
                const linkElements = linkName.split(" / ");
                // Create category 'miscellaneous' for examples without category name.
                let linkSubMenu = linkElements.length > 1 ? linkElements[0] : "miscellaneous";

                // Style: uppercase the first letter in case CSS lets lowercase.
                linkSubMenu = linkSubMenu.charAt(0).toUpperCase() + linkSubMenu.slice(1);
                // Create category if needed.
                if (categories[linkSubMenu] === undefined) {
                    categories[linkSubMenu] = [];
                }
                const visibleText =
                    linkElements.length === 1 ? linkName : linkElements.slice(1).join(" / ");
                
                // Create container for example item with thumbnail
                const exampleItem = document.createElement("div");
                exampleItem.className = "example-item";
                
                // Create thumbnail element
                const thumbnail = document.createElement("div");
                thumbnail.className = "example-thumbnail";
                
                // Extract example name for dynamic import
                const exampleName = pageUrl.split('/').pop()?.replace('.html', '') || '';
                
                // Load thumbnail asynchronously
                loadThumbnail(thumbnail, exampleName);
                
                // Create info container
                const infoContainer = document.createElement("div");
                infoContainer.className = "example-info";
                
                // Create title element
                const titleElement = document.createElement("h3");
                titleElement.className = "example-title";
                titleElement.textContent = visibleText;
                
                // Create category element
                const categoryElement = document.createElement("p");
                categoryElement.className = "example-category";
                categoryElement.textContent = linkSubMenu;
                
                // Append info elements
                infoContainer.appendChild(titleElement);
                infoContainer.appendChild(categoryElement);
                
                // Create link element (hidden, for navigation)
                const linkElement = createDomElement<HTMLAnchorElement>("a", {
                    href: "#" + pageUrl,
                    className: "link",
                    style: "display: none;"
                });
                (linkElement as any).nameWithCategory = linkName;
                (linkElement as any).nameWithoutCategory = visibleText;
                
                // Add click handler to example item to trigger link
                exampleItem.addEventListener("click", (event) => {
                    linkElement.click();
                });
                
                // Append thumbnail and info to example item
                exampleItem.appendChild(thumbnail);
                exampleItem.appendChild(infoContainer);
                exampleItem.appendChild(linkElement);
                
                categories[linkSubMenu].push(exampleItem);
                elements.push(linkElement);
            });

        Object.keys(categories)
            .sort()
            .forEach(category => {
                if (!orderedCategories.includes(category)) {
                    orderedCategories.push(category);
                }
            });

        orderedCategories.forEach(menuElement => {
            // Create category section
            const categorySection = document.createElement("div");
            categorySection.className = "category-section";
            
            // Create category title
            const categoryTitle = document.createElement("h2");
            categoryTitle.className = "category-title";
            categoryTitle.textContent = menuElement;
            titleElements.push(categoryTitle);
            
            // Append title to section
            categorySection.appendChild(categoryTitle);
            
            // Append examples to section
            const categoryExamples = categories[menuElement];
            if (categoryExamples === undefined) {
                return;
            }
            categoryExamples.forEach(example => {
                categorySection.appendChild(example);
            });
            
            exampleListElement.appendChild(categorySection);
        });
    }

    let isSearching: boolean = false;

    function goInSearchMode() {
        titleElements.forEach(title => {
            title.style.cssText = "display:none;";
        });
        
        // Only try to access magnifier-placeholder if it exists
        const magnifierPlaceholder = document.getElementById("magnifier-placeholder");
        if (magnifierPlaceholder) {
            magnifierPlaceholder.style.cssText = "display:none;";
        }
        
        // Only try to access clearFilterButton if it exists
        const clearFilterButton = document.getElementById("clearFilterButton");
        if (clearFilterButton) {
            clearFilterButton.style.cssText = "";
        }
        
        elements.forEach(anchor => {
            anchor.innerText = (anchor as any).nameWithCategory;
        });
        isSearching = true;
    }

    function leaveSearchMode() {
        titleElements.forEach(title => {
            title.style.cssText = "";
        });
        
        // Only try to access magnifier-placeholder if it exists
        const magnifierPlaceholder = document.getElementById("magnifier-placeholder");
        if (magnifierPlaceholder) {
            magnifierPlaceholder.style.cssText = "";
        }
        
        // Only try to access clearFilterButton if it exists
        const clearFilterButton = document.getElementById("clearFilterButton");
        if (clearFilterButton) {
            clearFilterButton.style.cssText = "display:none;";
        }
        
        elements.forEach(anchor => {
            anchor.classList.remove("filtered");
            anchor.innerText = (anchor as any).nameWithoutCategory;
        });
        (document.getElementById("filterInput") as HTMLInputElement).value = "";
        isSearching = false;
    }

    function installFilter(filterInput: HTMLInputElement) {
        filterInput.addEventListener("input", e => {
            const filterValue = (filterInput.value || "").trim();

            if (filterValue.length > 0 && !isSearching) {
                goInSearchMode();
            }

            if (filterValue.length === 0 && isSearching) {
                leaveSearchMode();
            }

            for (const element of elements) {
                const text = element.textContent;
                if (text === null) {
                    continue;
                }
                const matches = filterValue === "" || text.includes(filterValue.toLowerCase());
                if (matches) {
                    element.classList.remove("filtered");
                    // Also unhide parent example-item
                    if (element.parentElement) {
                        element.parentElement.classList.remove("filtered");
                    }
                } else {
                    element.classList.add("filtered");
                    // Also hide parent example-item
                    if (element.parentElement) {
                        element.parentElement.classList.add("filtered");
                    }
                }
            }
        });
        
        // Only add clear filter button event listener if the element exists
        const clearFilterButton = document.getElementById("clearFilterButton");
        if (clearFilterButton) {
            clearFilterButton.addEventListener("click", leaveSearchMode);
        }
    }

    /**
     * Shows an example.
     *
     * @param pageUrl - example page url, must exist in `examples` map
     */
    function showExample(pageUrl: string) {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;
        expandButton.classList.toggle("expanded", !navPanel.classList.contains("collapsed"));
        if (!(pageUrl in exampleDefinitions)) {
            exampleListElement.style.bottom = "365px";
            exampleFrameElement.contentWindow!.document.body.innerHTML =
                `<p style="color:#888;font-size:20px;font-family:sans-serif;text-align:center;` +
                `top: 50%; margin-top: -100px; position: absolute; width: 100% ">` +
                `<strong style="font-size:80px; ">404</strong><br/>Example not found</p>`;
            return;
        }

        // update the hash
        window.location.hash = "#" + pageUrl;
        if (queryParams) {
            window.location.search = queryParams;
        }

        // Set a soft background color before loading the page
        exampleFrameElement.style.backgroundColor = "#f8fafc";
        exampleFrameElement.style.backgroundImage = "radial-gradient(circle at 10% 20%, rgba(33, 150, 243, 0.05) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(0, 188, 212, 0.05) 0%, transparent 20%)";

        // load page in frame
        exampleFrameElement.src = pageUrl + queryParams;

        // highlight selected element in list
        elements.forEach(element => {
            const elementTargetPage = element.hash.substr(1);
            if (elementTargetPage === pageUrl) {
                element.classList.add("selected");
                // Also highlight parent example-item
                if (element.parentElement) {
                    element.parentElement.classList.add("selected");
                }
            } else {
                element.classList.remove("selected");
                // Also unhighlight parent example-item
                if (element.parentElement) {
                    element.parentElement.classList.remove("selected");
                }
            }
        });

        // update current source link
        currentlySelectedSource = exampleDefinitions[pageUrl];
        exampleListElement.style.bottom = "65px";

        // mobile: collapse the navPanel
        navPanel.classList.toggle("collapsed");
    }


    /**
     * Show example based on `location.hash` if it's not empty.
     */
    function showExampleFromHash() {
        const hash = window.location.hash;
        if (hash) {
            let pageUrl;

            //check if query parameters are added after the pageUrl in hash
            queryParams = "";
            const match = window.location.hash.match(/([^\?]*)\?(.*)/);
            if (match !== null && match.length > 2) {
                //query parameters found: the file name should not include the query parameters
                pageUrl = match[1].substring(1);
                queryParams = "?" + match[2];
            } else {
                pageUrl = window.location.hash.substring(1);
            }

            // possibly merge current window query string with one parsed-out from hash
            if (window.location.search) {
                queryParams = queryParams
                    ? window.location.search + "&" + queryParams.substr(1)
                    : window.location.search;
            }
            showExample(pageUrl);
        }
    }

    window.addEventListener("hashchange", showExampleFromHash);
    showExampleFromHash();

    type DomElementProps = Record<string, string>;

    function createDomElement<T = HTMLElement>(name: string, options?: DomElementProps): T {
        const element = document.createElement(name) as any as T;
        if (options !== undefined) {
            Object.assign(element as any, options as any);
        }
        return element;
    }

    /**
     * Convert example link name to readable link title.
     *
     * When converting a path both the all path components extension are removed.
     *
     * Example:
     *
     *     dist/hello.html -> hello
     *     dist/hello_react-native-web.html -> hello / react-native-web
     *
     * @returns human readale example name with components separated with '/'
     */
    function getName(pageUrl: string) {
        const name = basename(pageUrl)
            .replace(/\.[a-z]+$/, "")
            .split("_");
        return name.join(" / ");
    }

    /**
     * Get base name of file, so all parent folders and trailing '/' are removed.
     */
    function basename(path: string) {
        const i = path.lastIndexOf("/");
        if (i === -1) {
            return path;
        } else {
            return path.substr(i + 1);
        }
    }
}

/**
 * Maps pageUrl to srcUrl.
 *
 * Loaded using <script> tag `example-definitions.js`, which is generated by `webpack.config.js`.
 */
declare const examples: ExampleDefinitions;

exampleBrowser(examples);
