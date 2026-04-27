import React from "react";
export interface Example {
    id: string;
    title: string;
    description: string;
    category: string;
    categoryCode?: string;
    order?: number;
    code: string;
    language: string;
    image?: string;
}
export default function ExampleDetail(): React.JSX.Element;
