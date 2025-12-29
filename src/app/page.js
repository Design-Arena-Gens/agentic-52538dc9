"use client";

import { useMemo, useState } from "react";

const exampleRows = [
  "Acme Robotics, https://acmerobotics.io, https://www.linkedin.com/in/jordan-lee-founder-ceo/",
  "Northwind Analytics, northwindanalytics.com, https://www.linkedin.com/in/samantha-ray-operations/",
  "Blue Ridge Finance, https://blueridgefinance.com, https://www.linkedin.com/in/michael-dane-cfo",
];

export default function Home() {
  const [rawInput, setRawInput] = useState(exampleRows.join("\n"));
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const parsedEntries = useMemo(() => {
    const lines = rawInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.map((line) => {
      const parts = line.split(",").map((segment) => segment.trim());
      return {
        company: parts[0] || "",
        website: parts[1] || "",
        linkedinProfiles: parts.slice(2).flatMap((part) =>
          part
            .split(/[\s;|]+/)
            .map((item) => item.trim())
            .filter(Boolean)
        ),
      };
    });
  }, [rawInput]);

  const handleProcess = async () => {
    setProcessing(true);
    setError("");
    setResults([]);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entries: parsedEntries }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to process contacts.");
      }

      const payload = await response.json();
      setResults(payload.results || []);
    } catch (err) {
      setError(err?.message || "Unexpected error while processing data.");
    } finally {
      setProcessing(false);
    }
  };

  const handleClear = () => {
    setResults([]);
    setError("");
  };

  const handleDownload = () => {
    if (!results.length) return;
    const header = ["Name", "Role", "Company", "Email", "Confidence", "Source"];
    const rows = results.map((item) =>
      [
        item.name,
        item.role,
        item.company,
        item.email,
        item.confidence,
        item.source,
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "decision-makers.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),transparent_60%)] text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 lg:px-10 lg:py-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Decision-Maker Email Intelligence
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
            Paste company, website, and LinkedIn profile URLs. The system will
            extract likely decision makers, infer company email patterns, and
            generate professional contact emails with confidence scoring.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-cyan-500/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium text-slate-100">
                Input (CSV style)
              </h2>
              <button
                onClick={() => setRawInput(exampleRows.join("\n"))}
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                Reset example
              </button>
            </div>
            <textarea
              className="h-56 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40"
              value={rawInput}
              onChange={(event) => setRawInput(event.target.value)}
              spellCheck={false}
              placeholder="Company, website, LinkedIn Profile URL"
            />
            <p className="mt-3 text-xs text-slate-400">
              Format: <code>Company Name, website.com, linkedin-url</code>.
              Separate multiple LinkedIn profiles with spaces, pipes, or
              semicolons.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleProcess}
                disabled={processing}
                className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700/60"
              >
                {processing ? "Processing…" : "Generate Contacts"}
              </button>
              <button
                onClick={handleClear}
                disabled={!results.length && !error}
                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
              >
                Clear Output
              </button>
              <button
                onClick={handleDownload}
                disabled={!results.length}
                className="inline-flex items-center justify-center rounded-full border border-cyan-500/50 px-5 py-2 text-sm font-semibold text-cyan-300 transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
              >
                Download CSV
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <h2 className="text-lg font-medium text-slate-100">
              Parsed Companies
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {parsedEntries.length === 0 ? (
                <p className="text-slate-500">No companies detected yet.</p>
              ) : (
                parsedEntries.map((entry, index) => (
                  <div
                    key={`${entry.company}-${index}`}
                    className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3"
                  >
                    <p className="font-semibold text-slate-100">
                      {entry.company || "Unnamed company"}
                    </p>
                    <p className="text-xs text-slate-400">{entry.website}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.linkedinProfiles.length === 0 ? (
                        <span className="text-xs text-slate-500">
                          No LinkedIn profiles provided.
                        </span>
                      ) : (
                        entry.linkedinProfiles.map((profile) => (
                          <span
                            key={profile}
                            className="text-[11px] font-medium text-cyan-300"
                          >
                            {profile}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-inner shadow-cyan-500/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Decision-Maker Output
              </h2>
              <p className="text-xs text-slate-400">
                Generated professional emails with confidence levels and
                sourcing.
              </p>
            </div>
            <span className="text-xs uppercase tracking-widest text-slate-500">
              {results.length} contacts
            </span>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Company</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Confidence</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-sm text-slate-500"
                    >
                      {processing
                        ? "Analyzing inputs and discovering email patterns…"
                        : "Run the generator to view decision-maker contacts."}
                    </td>
                  </tr>
                ) : (
                  results.map((row) => (
                    <tr key={`${row.company}-${row.email}`} className="text-sm">
                      <td className="px-3 py-3 font-medium text-slate-100">
                        {row.name}
                      </td>
                      <td className="px-3 py-3 text-slate-300">{row.role}</td>
                      <td className="px-3 py-3 text-slate-300">{row.company}</td>
                      <td className="px-3 py-3 text-cyan-300">{row.email}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            row.confidence === "high"
                              ? "bg-emerald-500/20 text-emerald-200"
                              : row.confidence === "medium"
                              ? "bg-amber-500/20 text-amber-200"
                              : "bg-rose-500/20 text-rose-200"
                          }`}
                        >
                          {row.confidence}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-400">
                        <a
                          href={row.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-cyan-200"
                        >
                          Source
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
