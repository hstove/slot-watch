import * as React from "react";
import { useSearchParams } from "react-router-dom";

export function Timeline() {
  const [searchParams] = useSearchParams();
  const others = (searchParams.get("others") ?? "").split(",");
}
