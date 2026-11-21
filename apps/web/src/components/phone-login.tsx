"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CONSENT_VERSIONS, formatPhoneTR, normalizePhone, type ConsentType } from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";

type Step = "phone" | "code" | "profile";

// Zorunlu onaylar. "acik_riza_degerlendirme" zorunluluğu avukat görüşüne göre değişebilir
// (bkz. docs/kvkk-ve-degerlendirme-tasarimi.md, açık sorular).
const REQUIRED: ConsentType[] = ["kvkk_aydinlatma", "uyelik_sozlesmesi", "acik_riza_degerlendirme"];

export function PhoneLogin() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<Step>("phone");
  const [rawPhone, setRawPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [consents, setConsents] = useState<Record<ConsentType, boolean>>({
    kvkk_aydinlatma: false,
    uyelik_sozlesmesi: false,
    acik_riza_degerlendirme: false,
    ticari_ileti: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizePhone(rawPhone);
    if (!normalized) {
      setError("Geçerli bir cep telefonu numarası girin.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (error) {
      setError("SMS gönderilemedi. Lütfen biraz sonra tekrar deneyin.");
      return;
    }
    setPhone(normalized);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: "sms" });
    if (error || !data.user) {
      setBusy(false);
      setError("Kod hatalı veya süresi dolmuş.");
      return;
    }
    // Profil eksikse veya zorunlu onayların güncel sürümü yoksa onay adımına geç
    const [{ data: profile }, { data: given }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single(),
      supabase
        .from("user_consents")
        .select("consent_type, version, granted, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false }),
    ]);
    setBusy(false);
    const latest = new Map<string, { version: string; granted: boolean }>();
    for (const c of given ?? []) if (!latest.has(c.consent_type)) latest.set(c.consent_type, c);
    const consentsOk = REQUIRED.every((t) => {
      const c = latest.get(t);
      return c?.granted && c.version === CONSENT_VERSIONS[t];
    });
    if (!profile?.full_name || !consentsOk) {
      setFullName(profile?.full_name ?? "");
      setStep("profile");
      return;
    }
    router.push(safeNext);
    router.refresh();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 3) {
      setError("Lütfen adınızı ve soyadınızı girin.");
      return;
    }
    if (!REQUIRED.every((t) => consents[t])) {
      setError("Devam etmek için zorunlu onayları işaretleyin.");
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error: pErr } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", auth.user!.id);
    const results = await Promise.all(
      (Object.keys(consents) as ConsentType[]).map((t) =>
        supabase.rpc("record_consent", { p_type: t, p_version: CONSENT_VERSIONS[t], p_granted: consents[t] }),
      ),
    );
    setBusy(false);
    if (pErr || results.some((r) => r.error)) {
      setError("Bilgiler kaydedilemedi, tekrar deneyin.");
      return;
    }
    router.push(safeNext);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Giriş yap veya kayıt ol</h1>
            <p className="text-sm text-muted">Telefonunuza tek kullanımlık bir kod göndereceğiz.</p>
          </div>
          <div>
            <label className="label" htmlFor="phone">Cep telefonu</label>
            <input
              id="phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0532 123 45 67"
              value={rawPhone}
              onChange={(e) => setRawPhone(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? "Gönderiliyor…" : "Kod gönder"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Kodu girin</h1>
            <p className="text-sm text-muted">{formatPhoneTR(phone)} numarasına gönderilen 6 haneli kod.</p>
          </div>
          <input
            className="input text-center text-lg tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn w-full" disabled={busy || code.length < 6}>{busy ? "Doğrulanıyor…" : "Doğrula"}</button>
          <button type="button" className="w-full text-sm text-muted underline" onClick={() => setStep("phone")}>
            Numarayı değiştir
          </button>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Son bir adım</h1>
            <p className="text-sm text-muted">Adınız, randevu aldığınız işletmelerle paylaşılır.</p>
          </div>
          <div>
            <label className="label" htmlFor="name">Ad soyad</label>
            <input id="name" className="input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2 text-sm">
            <Consent checked={consents.kvkk_aydinlatma} onChange={(v) => setConsents((c) => ({ ...c, kvkk_aydinlatma: v }))}>
              <Link href="/kvkk" target="_blank" className="underline">KVKK Aydınlatma Metni</Link>’ni okudum.
            </Consent>
            <Consent checked={consents.uyelik_sozlesmesi} onChange={(v) => setConsents((c) => ({ ...c, uyelik_sozlesmesi: v }))}>
              <Link href="/uyelik-sozlesmesi" target="_blank" className="underline">Üyelik Sözleşmesi</Link>’ni kabul ediyorum.
            </Consent>
            <Consent
              checked={consents.acik_riza_degerlendirme}
              onChange={(v) => setConsents((c) => ({ ...c, acik_riza_degerlendirme: v }))}
            >
              Randevu katılım ve ödeme bilgilerimin bir güvenilirlik özeti olarak, randevu aldığım işletmelerle
              paylaşılmasına <Link href="/kvkk#degerlendirme" target="_blank" className="underline">açık rıza</Link> veriyorum.
            </Consent>
            <Consent checked={consents.ticari_ileti} onChange={(v) => setConsents((c) => ({ ...c, ticari_ileti: v }))}>
              Kampanya ve duyurular için SMS almak istiyorum. <span className="text-muted">(İsteğe bağlı)</span>
            </Consent>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? "Kaydediliyor…" : "Devam et"}</button>
        </form>
      )}
    </div>
  );
}

function Consent({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-2">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
