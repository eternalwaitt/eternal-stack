"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <section>
      <h2>Dashboard</h2>
      <button type="button" onClick={() => setIsLoading(true)}>
        Submit
      </button>
      {isLoading ? <span>Loading</span> : null}
      <input placeholder="Search invoices" />
    </section>
  );
}
