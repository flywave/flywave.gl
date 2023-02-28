import {
    APIFormat,
    AuthenticationMethod,
} from "@flywave/flywave-vectortile-datasource";
import VectorMaterialProvider from "../vector-material-provider";

class MapboxMvtMaterialProvider extends VectorMaterialProvider {
    constructor(application) {
        super({
            baseUrl: "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8",
            apiFormat: APIFormat.XYZMVT,
            styleSetName: "tilezen",
            maxDataLevel: 17,
            dataSourceOrder: 0,
            addGroundPlane: false,
            authenticationCode: "tk.eyJ1IjoidzEyNTk0ODIyIiwiZXhwIjoxNjQ5MzE2OTI2LCJpYXQiOjE2NDkzMTMzMjYsInNjb3BlcyI6WyJlc3NlbnRpYWxzIiwic2NvcGVzOmxpc3QiLCJtYXA6cmVhZCIsIm1hcDp3cml0ZSIsInVzZXI6cmVhZCIsInVzZXI6d3JpdGUiLCJ1cGxvYWRzOnJlYWQiLCJ1cGxvYWRzOmxpc3QiLCJ1cGxvYWRzOndyaXRlIiwic3R5bGVzOnRpbGVzIiwic3R5bGVzOnJlYWQiLCJmb250czpsaXN0IiwiZm9udHM6cmVhZCIsImZvbnRzOndyaXRlIiwic3R5bGVzOndyaXRlIiwic3R5bGVzOmxpc3QiLCJzdHlsZXM6ZG93bmxvYWQiLCJzdHlsZXM6cHJvdGVjdCIsInRva2VuczpyZWFkIiwidG9rZW5zOndyaXRlIiwiZGF0YXNldHM6bGlzdCIsImRhdGFzZXRzOnJlYWQiLCJkYXRhc2V0czp3cml0ZSIsInRpbGVzZXRzOmxpc3QiLCJ0aWxlc2V0czpyZWFkIiwidGlsZXNldHM6d3JpdGUiLCJkb3dubG9hZHM6cmVhZCIsInZpc2lvbjpyZWFkIiwidmlzaW9uOmRvd25sb2FkIiwibmF2aWdhdGlvbjpkb3dubG9hZCIsIm9mZmxpbmU6cmVhZCIsIm9mZmxpbmU6d3JpdGUiLCJzdHlsZXM6ZHJhZnQiLCJmb250czptZXRhZGF0YSIsInNwcml0ZS1pbWFnZXM6cmVhZCIsImRhdGFzZXRzOnN0dWRpbyIsImN1c3RvbWVyczp3cml0ZSIsImNyZWRlbnRpYWxzOnJlYWQiLCJjcmVkZW50aWFsczp3cml0ZSIsImFuYWx5dGljczpyZWFkIl0sImNsaWVudCI6Im1hcGJveC5jb20iLCJsbCI6MTYzMDQwMzE2MzA1OSwiaXUiOm51bGwsImVtYWlsIjoidzEyNTk0ODIyQDEyNi5jb20ifQ.yorWF4h1MLGkv5eVNp12CQ",
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "access_token"
            },
        },application)
    } 
}

export default MapboxMvtMaterialProvider;