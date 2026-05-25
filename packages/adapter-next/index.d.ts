import { PrimitiveNode, PageMeta, HeroMeta, SectionMeta, CardMeta, CTAMeta, Page, Hero, Section, Card, CTA, SLOT_REGISTRY } from "./catalog/index.js";
declare const _default: {
    name: string;
    version: string;
    catalog: {
        primitives: {
            Page: {
                schema: import("zod").ZodObject<{
                    primitive: import("zod").ZodLiteral<"Page">;
                    slug: import("zod").ZodString;
                    title: import("zod").ZodString;
                    tree: import("zod").ZodArray<import("zod").ZodUnion<[import("zod").ZodObject<{
                        primitive: import("zod").ZodLiteral<"Hero">;
                        id: import("zod").ZodString;
                        variant: import("zod").ZodEnum<["centered", "overlay"]>;
                        title: import("zod").ZodString;
                        subtitle: import("zod").ZodOptional<import("zod").ZodString>;
                        cta: import("zod").ZodOptional<import("zod").ZodObject<{
                            label: import("zod").ZodString;
                            href: import("zod").ZodString;
                            variant: import("zod").ZodOptional<import("zod").ZodEnum<["primary", "secondary"]>>;
                        }, "strict", import("zod").ZodTypeAny, {
                            label: string;
                            href: string;
                            variant?: "primary" | "secondary" | undefined;
                        }, {
                            label: string;
                            href: string;
                            variant?: "primary" | "secondary" | undefined;
                        }>>;
                    }, "strict", import("zod").ZodTypeAny, {
                        primitive: "Hero";
                        id: string;
                        variant: "centered" | "overlay";
                        title: string;
                        subtitle?: string | undefined;
                        cta?: {
                            label: string;
                            href: string;
                            variant?: "primary" | "secondary" | undefined;
                        } | undefined;
                    }, {
                        primitive: "Hero";
                        id: string;
                        variant: "centered" | "overlay";
                        title: string;
                        subtitle?: string | undefined;
                        cta?: {
                            label: string;
                            href: string;
                            variant?: "primary" | "secondary" | undefined;
                        } | undefined;
                    }>, import("zod").ZodObject<{
                        primitive: import("zod").ZodLiteral<"Section">;
                        id: import("zod").ZodString;
                        title: import("zod").ZodOptional<import("zod").ZodString>;
                        cards: import("zod").ZodArray<import("zod").ZodObject<{
                            primitive: import("zod").ZodLiteral<"Card">;
                            id: import("zod").ZodString;
                            title: import("zod").ZodString;
                            description: import("zod").ZodString;
                            icon: import("zod").ZodOptional<import("zod").ZodString>;
                        }, "strict", import("zod").ZodTypeAny, {
                            primitive: "Card";
                            id: string;
                            title: string;
                            description: string;
                            icon?: string | undefined;
                        }, {
                            primitive: "Card";
                            id: string;
                            title: string;
                            description: string;
                            icon?: string | undefined;
                        }>, "many">;
                    }, "strict", import("zod").ZodTypeAny, {
                        primitive: "Section";
                        id: string;
                        cards: {
                            primitive: "Card";
                            id: string;
                            title: string;
                            description: string;
                            icon?: string | undefined;
                        }[];
                        title?: string | undefined;
                    }, {
                        primitive: "Section";
                        id: string;
                        cards: {
                            primitive: "Card";
                            id: string;
                            title: string;
                            description: string;
                            icon?: string | undefined;
                        }[];
                        title?: string | undefined;
                    }>, import("zod").ZodObject<{
                        primitive: import("zod").ZodLiteral<"CTA">;
                        id: import("zod").ZodString;
                        label: import("zod").ZodString;
                        href: import("zod").ZodString;
                        variant: import("zod").ZodDefault<import("zod").ZodEnum<["primary", "secondary"]>>;
                    }, "strict", import("zod").ZodTypeAny, {
                        primitive: "CTA";
                        id: string;
                        variant: "primary" | "secondary";
                        label: string;
                        href: string;
                    }, {
                        primitive: "CTA";
                        id: string;
                        label: string;
                        href: string;
                        variant?: "primary" | "secondary" | undefined;
                    }>]>, "many">;
                }, "strict", import("zod").ZodTypeAny, {
                    primitive: "Page";
                    title: string;
                    slug: string;
                    tree: ({
                        primitive: "Hero";
                        id: string;
                        variant: "centered" | "overlay";
                        title: string;
                        subtitle?: string | undefined;
                        cta?: {
                            label: string;
                            href: string;
                            variant?: "primary" | "secondary" | undefined;
                        } | undefined;
                    } | {
                        primitive: "Section";
                        id: string;
                        cards: {
                            primitive: "Card";
                            id: string;
                            title: string;
                            description: string;
                            icon?: string | undefined;
                        }[];
                        title?: string | undefined;
                    } | {
                        primitive: "CTA";
                        id: string;
                        variant: "primary" | "secondary";
                        label: string;
                        href: string;
                    })[];
                }, {
                    primitive: "Page";
                    title: string;
                    slug: string;
                    tree: ({
                        primitive: "Hero";
                        id: string;
                        variant: "centered" | "overlay";
                        title: string;
                        subtitle?: string | undefined;
                        cta?: {
                            label: string;
                            href: string;
                            variant?: "primary" | "secondary" | undefined;
                        } | undefined;
                    } | {
                        primitive: "Section";
                        id: string;
                        cards: {
                            primitive: "Card";
                            id: string;
                            title: string;
                            description: string;
                            icon?: string | undefined;
                        }[];
                        title?: string | undefined;
                    } | {
                        primitive: "CTA";
                        id: string;
                        label: string;
                        href: string;
                        variant?: "primary" | "secondary" | undefined;
                    })[];
                }>;
                meta: import("@composer/adapter-kit").PrimitiveMeta;
            };
            Hero: {
                schema: import("zod").ZodObject<{
                    primitive: import("zod").ZodLiteral<"Hero">;
                    id: import("zod").ZodString;
                    variant: import("zod").ZodEnum<["centered", "overlay"]>;
                    title: import("zod").ZodString;
                    subtitle: import("zod").ZodOptional<import("zod").ZodString>;
                    cta: import("zod").ZodOptional<import("zod").ZodObject<{
                        label: import("zod").ZodString;
                        href: import("zod").ZodString;
                        variant: import("zod").ZodOptional<import("zod").ZodEnum<["primary", "secondary"]>>;
                    }, "strict", import("zod").ZodTypeAny, {
                        label: string;
                        href: string;
                        variant?: "primary" | "secondary" | undefined;
                    }, {
                        label: string;
                        href: string;
                        variant?: "primary" | "secondary" | undefined;
                    }>>;
                }, "strict", import("zod").ZodTypeAny, {
                    primitive: "Hero";
                    id: string;
                    variant: "centered" | "overlay";
                    title: string;
                    subtitle?: string | undefined;
                    cta?: {
                        label: string;
                        href: string;
                        variant?: "primary" | "secondary" | undefined;
                    } | undefined;
                }, {
                    primitive: "Hero";
                    id: string;
                    variant: "centered" | "overlay";
                    title: string;
                    subtitle?: string | undefined;
                    cta?: {
                        label: string;
                        href: string;
                        variant?: "primary" | "secondary" | undefined;
                    } | undefined;
                }>;
                meta: import("@composer/adapter-kit").PrimitiveMeta;
            };
            Section: {
                schema: import("zod").ZodObject<{
                    primitive: import("zod").ZodLiteral<"Section">;
                    id: import("zod").ZodString;
                    title: import("zod").ZodOptional<import("zod").ZodString>;
                    cards: import("zod").ZodArray<import("zod").ZodObject<{
                        primitive: import("zod").ZodLiteral<"Card">;
                        id: import("zod").ZodString;
                        title: import("zod").ZodString;
                        description: import("zod").ZodString;
                        icon: import("zod").ZodOptional<import("zod").ZodString>;
                    }, "strict", import("zod").ZodTypeAny, {
                        primitive: "Card";
                        id: string;
                        title: string;
                        description: string;
                        icon?: string | undefined;
                    }, {
                        primitive: "Card";
                        id: string;
                        title: string;
                        description: string;
                        icon?: string | undefined;
                    }>, "many">;
                }, "strict", import("zod").ZodTypeAny, {
                    primitive: "Section";
                    id: string;
                    cards: {
                        primitive: "Card";
                        id: string;
                        title: string;
                        description: string;
                        icon?: string | undefined;
                    }[];
                    title?: string | undefined;
                }, {
                    primitive: "Section";
                    id: string;
                    cards: {
                        primitive: "Card";
                        id: string;
                        title: string;
                        description: string;
                        icon?: string | undefined;
                    }[];
                    title?: string | undefined;
                }>;
                meta: import("@composer/adapter-kit").PrimitiveMeta;
            };
            Card: {
                schema: import("zod").ZodObject<{
                    primitive: import("zod").ZodLiteral<"Card">;
                    id: import("zod").ZodString;
                    title: import("zod").ZodString;
                    description: import("zod").ZodString;
                    icon: import("zod").ZodOptional<import("zod").ZodString>;
                }, "strict", import("zod").ZodTypeAny, {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }, {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }>;
                meta: import("@composer/adapter-kit").PrimitiveMeta;
            };
            CTA: {
                schema: import("zod").ZodObject<{
                    primitive: import("zod").ZodLiteral<"CTA">;
                    id: import("zod").ZodString;
                    label: import("zod").ZodString;
                    href: import("zod").ZodString;
                    variant: import("zod").ZodDefault<import("zod").ZodEnum<["primary", "secondary"]>>;
                }, "strict", import("zod").ZodTypeAny, {
                    primitive: "CTA";
                    id: string;
                    variant: "primary" | "secondary";
                    label: string;
                    href: string;
                }, {
                    primitive: "CTA";
                    id: string;
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                }>;
                meta: import("@composer/adapter-kit").PrimitiveMeta;
            };
        };
        slotRegistry: import("@composer/adapter-kit").SlotRegistry;
        index: import("zod").ZodDiscriminatedUnion<"primitive", [import("zod").ZodObject<{
            primitive: import("zod").ZodLiteral<"Page">;
            slug: import("zod").ZodString;
            title: import("zod").ZodString;
            tree: import("zod").ZodArray<import("zod").ZodUnion<[import("zod").ZodObject<{
                primitive: import("zod").ZodLiteral<"Hero">;
                id: import("zod").ZodString;
                variant: import("zod").ZodEnum<["centered", "overlay"]>;
                title: import("zod").ZodString;
                subtitle: import("zod").ZodOptional<import("zod").ZodString>;
                cta: import("zod").ZodOptional<import("zod").ZodObject<{
                    label: import("zod").ZodString;
                    href: import("zod").ZodString;
                    variant: import("zod").ZodOptional<import("zod").ZodEnum<["primary", "secondary"]>>;
                }, "strict", import("zod").ZodTypeAny, {
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                }, {
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                }>>;
            }, "strict", import("zod").ZodTypeAny, {
                primitive: "Hero";
                id: string;
                variant: "centered" | "overlay";
                title: string;
                subtitle?: string | undefined;
                cta?: {
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                } | undefined;
            }, {
                primitive: "Hero";
                id: string;
                variant: "centered" | "overlay";
                title: string;
                subtitle?: string | undefined;
                cta?: {
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                } | undefined;
            }>, import("zod").ZodObject<{
                primitive: import("zod").ZodLiteral<"Section">;
                id: import("zod").ZodString;
                title: import("zod").ZodOptional<import("zod").ZodString>;
                cards: import("zod").ZodArray<import("zod").ZodObject<{
                    primitive: import("zod").ZodLiteral<"Card">;
                    id: import("zod").ZodString;
                    title: import("zod").ZodString;
                    description: import("zod").ZodString;
                    icon: import("zod").ZodOptional<import("zod").ZodString>;
                }, "strict", import("zod").ZodTypeAny, {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }, {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }>, "many">;
            }, "strict", import("zod").ZodTypeAny, {
                primitive: "Section";
                id: string;
                cards: {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }[];
                title?: string | undefined;
            }, {
                primitive: "Section";
                id: string;
                cards: {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }[];
                title?: string | undefined;
            }>, import("zod").ZodObject<{
                primitive: import("zod").ZodLiteral<"CTA">;
                id: import("zod").ZodString;
                label: import("zod").ZodString;
                href: import("zod").ZodString;
                variant: import("zod").ZodDefault<import("zod").ZodEnum<["primary", "secondary"]>>;
            }, "strict", import("zod").ZodTypeAny, {
                primitive: "CTA";
                id: string;
                variant: "primary" | "secondary";
                label: string;
                href: string;
            }, {
                primitive: "CTA";
                id: string;
                label: string;
                href: string;
                variant?: "primary" | "secondary" | undefined;
            }>]>, "many">;
        }, "strict", import("zod").ZodTypeAny, {
            primitive: "Page";
            title: string;
            slug: string;
            tree: ({
                primitive: "Hero";
                id: string;
                variant: "centered" | "overlay";
                title: string;
                subtitle?: string | undefined;
                cta?: {
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                } | undefined;
            } | {
                primitive: "Section";
                id: string;
                cards: {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }[];
                title?: string | undefined;
            } | {
                primitive: "CTA";
                id: string;
                variant: "primary" | "secondary";
                label: string;
                href: string;
            })[];
        }, {
            primitive: "Page";
            title: string;
            slug: string;
            tree: ({
                primitive: "Hero";
                id: string;
                variant: "centered" | "overlay";
                title: string;
                subtitle?: string | undefined;
                cta?: {
                    label: string;
                    href: string;
                    variant?: "primary" | "secondary" | undefined;
                } | undefined;
            } | {
                primitive: "Section";
                id: string;
                cards: {
                    primitive: "Card";
                    id: string;
                    title: string;
                    description: string;
                    icon?: string | undefined;
                }[];
                title?: string | undefined;
            } | {
                primitive: "CTA";
                id: string;
                label: string;
                href: string;
                variant?: "primary" | "secondary" | undefined;
            })[];
        }>, import("zod").ZodObject<{
            primitive: import("zod").ZodLiteral<"Hero">;
            id: import("zod").ZodString;
            variant: import("zod").ZodEnum<["centered", "overlay"]>;
            title: import("zod").ZodString;
            subtitle: import("zod").ZodOptional<import("zod").ZodString>;
            cta: import("zod").ZodOptional<import("zod").ZodObject<{
                label: import("zod").ZodString;
                href: import("zod").ZodString;
                variant: import("zod").ZodOptional<import("zod").ZodEnum<["primary", "secondary"]>>;
            }, "strict", import("zod").ZodTypeAny, {
                label: string;
                href: string;
                variant?: "primary" | "secondary" | undefined;
            }, {
                label: string;
                href: string;
                variant?: "primary" | "secondary" | undefined;
            }>>;
        }, "strict", import("zod").ZodTypeAny, {
            primitive: "Hero";
            id: string;
            variant: "centered" | "overlay";
            title: string;
            subtitle?: string | undefined;
            cta?: {
                label: string;
                href: string;
                variant?: "primary" | "secondary" | undefined;
            } | undefined;
        }, {
            primitive: "Hero";
            id: string;
            variant: "centered" | "overlay";
            title: string;
            subtitle?: string | undefined;
            cta?: {
                label: string;
                href: string;
                variant?: "primary" | "secondary" | undefined;
            } | undefined;
        }>, import("zod").ZodObject<{
            primitive: import("zod").ZodLiteral<"Section">;
            id: import("zod").ZodString;
            title: import("zod").ZodOptional<import("zod").ZodString>;
            cards: import("zod").ZodArray<import("zod").ZodObject<{
                primitive: import("zod").ZodLiteral<"Card">;
                id: import("zod").ZodString;
                title: import("zod").ZodString;
                description: import("zod").ZodString;
                icon: import("zod").ZodOptional<import("zod").ZodString>;
            }, "strict", import("zod").ZodTypeAny, {
                primitive: "Card";
                id: string;
                title: string;
                description: string;
                icon?: string | undefined;
            }, {
                primitive: "Card";
                id: string;
                title: string;
                description: string;
                icon?: string | undefined;
            }>, "many">;
        }, "strict", import("zod").ZodTypeAny, {
            primitive: "Section";
            id: string;
            cards: {
                primitive: "Card";
                id: string;
                title: string;
                description: string;
                icon?: string | undefined;
            }[];
            title?: string | undefined;
        }, {
            primitive: "Section";
            id: string;
            cards: {
                primitive: "Card";
                id: string;
                title: string;
                description: string;
                icon?: string | undefined;
            }[];
            title?: string | undefined;
        }>, import("zod").ZodObject<{
            primitive: import("zod").ZodLiteral<"Card">;
            id: import("zod").ZodString;
            title: import("zod").ZodString;
            description: import("zod").ZodString;
            icon: import("zod").ZodOptional<import("zod").ZodString>;
        }, "strict", import("zod").ZodTypeAny, {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }, {
            primitive: "Card";
            id: string;
            title: string;
            description: string;
            icon?: string | undefined;
        }>, import("zod").ZodObject<{
            primitive: import("zod").ZodLiteral<"CTA">;
            id: import("zod").ZodString;
            label: import("zod").ZodString;
            href: import("zod").ZodString;
            variant: import("zod").ZodDefault<import("zod").ZodEnum<["primary", "secondary"]>>;
        }, "strict", import("zod").ZodTypeAny, {
            primitive: "CTA";
            id: string;
            variant: "primary" | "secondary";
            label: string;
            href: string;
        }, {
            primitive: "CTA";
            id: string;
            label: string;
            href: string;
            variant?: "primary" | "secondary" | undefined;
        }>]>;
    };
    outputMap: import("@composer/adapter-kit").OutputMap;
    audit: import("@composer/adapter-kit").AuditRule;
    bootstrap: import("@composer/adapter-kit").BootstrapFn;
};
export default _default;
export { PrimitiveNode, Page, Hero, Section, Card, CTA, SLOT_REGISTRY };
export { PageMeta, HeroMeta, SectionMeta, CardMeta, CTAMeta };
//# sourceMappingURL=index.d.ts.map