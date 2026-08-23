export function createArtworkSearch(providers, { defaultProviderIds } = {}) {
  const registry = new Map(providers.map((provider) => [provider.id, provider]));
  const defaults = defaultProviderIds || providers.map((provider) => provider.id);

  function resolveProviders(providerIds) {
    const requested = providerIds == null ? defaults : providerIds;
    const unique = [...new Set(requested)];
    if (!unique.length) throw new Error("Select at least one artwork provider.");

    const unknown = unique.filter((id) => !registry.has(id));
    if (unknown.length) {
      throw new Error(`Unsupported artwork provider: ${unknown.join(", ")}`);
    }

    return unique.map((id) => registry.get(id));
  }

  return Object.freeze({
    providers: providers.map(({ id, label }) => ({ id, label })),
    resolveProviders,
    async search({ query, page = 1, limit = 24, providerIds }) {
      const selected = resolveProviders(providerIds);
      const settled = await Promise.allSettled(
        selected.map((provider) => provider.search({ query, page, limit })),
      );
      const items = [];
      const errors = [];

      settled.forEach((result, index) => {
        const provider = selected[index];
        if (result.status === "fulfilled") {
          items.push(...result.value);
        } else {
          errors.push({
            provider: provider.id,
            label: provider.label,
            error: result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          });
        }
      });

      return { items, errors };
    },
  });
}
