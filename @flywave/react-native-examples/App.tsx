/* Copyright (C) 2025 flywave.gl contributors */

import React from "react";
import { StyleSheet, View, Text, SafeAreaView, ActivityIndicator } from "react-native";
import { GLView, MapView, GeoCoordinates } from "@flywave/react-native-gl";

interface Theme {
    version: string;
    name: string;
    styles: unknown[];
    background: {
        color: number[];
    };
}

export default function App(): React.JSX.Element {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [position, setPosition] = React.useState<string>("Initializing...");

    const theme: Theme = React.useMemo(
        () => ({
            version: "1.0.0",
            name: "Flywave React Native Theme",
            styles: [],
            background: {
                color: [0.9, 0.9, 0.95, 1.0]
            }
        }),
        []
    );

    const handleContextCreate = React.useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (gl: unknown, mapView: MapView): void => {
            // eslint-disable-next-line no-console
            console.log("Map context created with WebGL:", gl);
            // eslint-disable-next-line no-console
            console.log("MapView initialized:", mapView);

            try {
                setLoading(false);
                setPosition("Ready");

                const center = new GeoCoordinates(39.9042, 116.4074);

                // eslint-disable-next-line no-console
                console.log("Map initialized successfully at:", center);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(errorMessage);
                setLoading(false);
                setPosition("Error");
            }
        },
        []
    );

    if (error) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorTitle}>Initialization Error</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <Text style={styles.errorHint}>Please check console logs for more details</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Flywave React Native</Text>
                <Text style={styles.subtitle}>3D Maps with GLView</Text>
                <Text style={styles.status}>Status: {position}</Text>
            </View>
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Initializing 3D Map...</Text>
                </View>
            ) : (
                <GLView
                    style={styles.mapView}
                    theme={theme}
                    onContextCreate={handleContextCreate}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#ffffff"
    },
    header: {
        padding: 20,
        backgroundColor: "#f5f5f5",
        borderBottomWidth: 1,
        borderBottomColor: "#e0e0e0",
        alignItems: "center"
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#333333",
        marginBottom: 5
    },
    subtitle: {
        fontSize: 16,
        color: "#666666",
        marginBottom: 5
    },
    status: {
        fontSize: 14,
        color: "#007AFF",
        fontWeight: "600"
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20
    },
    loadingText: {
        marginTop: 15,
        fontSize: 16,
        color: "#666666"
    },
    mapView: {
        flex: 1,
        backgroundColor: "#000000"
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 30
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#ff3b30",
        marginBottom: 15
    },
    errorText: {
        fontSize: 16,
        color: "#333333",
        textAlign: "center",
        marginBottom: 20
    },
    errorHint: {
        fontSize: 14,
        color: "#666666",
        textAlign: "center"
    }
});
