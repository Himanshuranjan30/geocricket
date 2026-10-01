"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const signInWithGoogle = (callbackURL = "/") => authClient.signIn.social({ provider: "google", callbackURL });
// Full reload on purpose: drops all signed-in client state.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
export const signOut = () => authClient.signOut().then(() => window.location.assign("/"));
