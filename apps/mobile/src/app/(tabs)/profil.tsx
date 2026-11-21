import { formatPhoneTR } from '@randevu/shared';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { WEB_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [fullName, setFullName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setFullName(data?.full_name ?? ''));
  }, [session]);

  if (!session) {
    return (
      <Screen>
        <ThemedText type="subtitle">Profil</ThemedText>
        <Muted>Telefon numaranızla saniyeler içinde hesap oluşturun.</Muted>
        <Button title="Giriş yap / Kayıt ol" onPress={() => router.push('/giris')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Profil</ThemedText>
      <Card>
        <Muted>Telefon</Muted>
        <ThemedText>{session.user.phone ? formatPhoneTR(session.user.phone) : '-'}</ThemedText>
        <Muted>Ad soyad</Muted>
        <Input value={fullName} onChangeText={setFullName} />
        <Button
          title="Kaydet"
          onPress={async () => {
            const { error } = await supabase
              .from('profiles')
              .update({ full_name: fullName.trim() })
              .eq('id', session.user.id);
            setSaved(error ? 'Kaydedilemedi.' : 'Kaydedildi.');
          }}
        />
        {saved && <Muted>{saved}</Muted>}
      </Card>

      <Card>
        <ThemedText type="smallBold">İşletme sahibi misiniz?</ThemedText>
        <Muted>İşletmenizi, listenizi ve randevularınızı web panelinden yönetebilirsiniz.</Muted>
        <Button title="İşletme paneli" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/panel`)} />
      </Card>

      <Button title="KVKK Aydınlatma Metni" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/kvkk`)} />
      <Button title="Çıkış yap" variant="danger" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
