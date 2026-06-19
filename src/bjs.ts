// Single re-export point for Babylon symbols. Using the aggregate package
// guarantees all mesh builders / materials are registered (no missing
// side-effect imports), which is the pragmatic choice for a prototype.
export * from "@babylonjs/core";
