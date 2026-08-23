const USER_AGENT = "HoloStudio/1.0 (personal art tool)";

export async function fetchJson(url, { fetchImpl = fetch, provider } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${provider || "Image provider"} returned ${response.status}`);
  }

  return response.json();
}

export { USER_AGENT };
