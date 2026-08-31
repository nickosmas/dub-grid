import { Redirect, useLocalSearchParams } from "expo-router";

/** Keeps existing deep links working while Staff Profile uses the root stack. */
export default function LegacyPersonRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const personId = Array.isArray(id) ? id[0] : id;

  return <Redirect href={{ pathname: "/person/[id]", params: { id: personId ?? "" } }} />;
}
