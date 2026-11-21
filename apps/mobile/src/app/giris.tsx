import { CONSENT_VERSIONS, formatPhoneTR, normalizePhone, type ConsentType } from '@randevu/shared';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Input, Muted, Screen, styles } from '@/components/ui';
import { WEB_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

type Step = 'phone' | 'code' | 'profile';
// Zorunlu onaylar. Açık rıza zorunluluğu avukat görüşüne göre değişebilir (docs/kvkk-ve-degerlendirme-tasarimi.md).
const REQUIRED: ConsentType[] = ['kvkk_aydinlatma', 'uyelik_sozlesmesi', 'acik_riza_degerlendirme'];

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('phone');
  const [rawPhone, setRawPhone] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [consents, setConsents] = useState<Record<ConsentType, boolean>>({
    kvkk_aydinlatma: false,
    uyelik_sozlesmesi: false,
    acik_riza_degerlendirme: false,
    ticari_ileti: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function sendCode() {
    setError(null);
    const normalized = normalizePhone(rawPhone);
    if (!normalized) return setError('Geçerli bir cep telefonu numarası girin.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (error) return setError('SMS gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
    setPhone(normalized);
    setStep('code');
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error || !data.user) {
      setBusy(false);
      return setError('Kod hatalı veya süresi dolmuş.');
    }
    const [{ data: profile }, { data: given }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', data.user.id).single(),
      supabase
        .from('user_consents')
        .select('consent_type, version, granted')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false }),
    ]);
    setBusy(false);
    const latest = new Map<string, { version: string; granted: boolean }>();
    for (const c of given ?? []) if (!latest.has(c.consent_type)) latest.set(c.consent_type, c);
    const ok = REQUIRED.every((t) => latest.get(t)?.granted && latest.get(t)?.version === CONSENT_VERSIONS[t]);
    if (!profile?.full_name || !ok) {
      setFullName(profile?.full_name ?? '');
      setStep('profile');
      return;
    }
    finish();
  }

  async function saveProfile() {
    setError(null);
    if (fullName.trim().length < 3) return setError('Lütfen adınızı ve soyadınızı girin.');
    if (!REQUIRED.every((t) => consents[t])) return setError('Devam etmek için zorunlu onayları işaretleyin.');
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error: pErr } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', auth.user!.id);
    const results = await Promise.all(
      (Object.keys(consents) as ConsentType[]).map((t) =>
        supabase.rpc('record_consent', { p_type: t, p_version: CONSENT_VERSIONS[t], p_granted: consents[t] }),
      ),
    );
    setBusy(false);
    if (pErr || results.some((r) => r.error)) return setError('Bilgiler kaydedilemedi, tekrar deneyin.');
    finish();
  }

  const consentRow = (key: ConsentType, text: string, link?: string) => (
    <View key={key} style={[styles.row, { alignItems: 'flex-start' }]}>
      <Switch value={consents[key]} onValueChange={(v) => setConsents((c) => ({ ...c, [key]: v }))} />
      <Pressable style={{ flex: 1 }} onPress={() => link && WebBrowser.openBrowserAsync(`${WEB_URL}${link}`)}>
        <ThemedText type="small">
          {text}
          {link ? ' (oku)' : ''}
        </ThemedText>
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <Card>
        {step === 'phone' && (
          <>
            <ThemedText type="smallBold">Giriş yap veya kayıt ol</ThemedText>
            <Muted>Telefonunuza tek kullanımlık bir kod göndereceğiz.</Muted>
            <Input
              placeholder="0532 123 45 67"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={rawPhone}
              onChangeText={setRawPhone}
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button title="Kod gönder" loading={busy} onPress={sendCode} />
          </>
        )}

        {step === 'code' && (
          <>
            <ThemedText type="smallBold">Kodu girin</ThemedText>
            <Muted>{formatPhoneTR(phone)} numarasına gönderilen 6 haneli kod.</Muted>
            <Input
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
              style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20 }}
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button title="Doğrula" loading={busy} disabled={code.length < 6} onPress={verify} />
            <Button title="Numarayı değiştir" variant="ghost" onPress={() => setStep('phone')} />
          </>
        )}

        {step === 'profile' && (
          <>
            <ThemedText type="smallBold">Son bir adım</ThemedText>
            <Muted>Adınız, randevu aldığınız işletmelerle paylaşılır.</Muted>
            <Input placeholder="Ad soyad" autoComplete="name" value={fullName} onChangeText={setFullName} />
            {consentRow('kvkk_aydinlatma', 'KVKK Aydınlatma Metni’ni okudum.', '/kvkk')}
            {consentRow('uyelik_sozlesmesi', 'Üyelik Sözleşmesi’ni kabul ediyorum.', '/uyelik-sozlesmesi')}
            {consentRow(
              'acik_riza_degerlendirme',
              'Randevu katılım ve ödeme bilgilerimin bir güvenilirlik özeti olarak, randevu aldığım işletmelerle paylaşılmasına açık rıza veriyorum.',
              '/kvkk#degerlendirme',
            )}
            {consentRow('ticari_ileti', 'Kampanya ve duyurular için SMS almak istiyorum (isteğe bağlı).')}
            {error && <ErrorText>{error}</ErrorText>}
            <Button title="Devam et" loading={busy} onPress={saveProfile} />
          </>
        )}
      </Card>
    </Screen>
  );
}
