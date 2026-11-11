import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { temaDoEsquema } from '../tema';

import type { ReactNode } from 'react';

/** Componentes nativos sobre os design tokens (ADR-015); o design system web não entra no app. */
export function Tela({ children }: { readonly children: ReactNode }) {
  const tema = temaDoEsquema(useColorScheme());
  return (
    <View
      style={[estilos.tela, { backgroundColor: tema.cores.fundo, padding: tema.espacamento[4] }]}
    >
      {children}
    </View>
  );
}

export function Titulo({ children }: { readonly children: string }) {
  const tema = temaDoEsquema(useColorScheme());
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: tema.cores.texto,
        fontSize: tema.tamanhosFonte['2xl'].tamanho,
        lineHeight: tema.tamanhosFonte['2xl'].alturaLinha,
        fontWeight: '600',
      }}
    >
      {children}
    </Text>
  );
}

export function Paragrafo({ children }: { readonly children: string }) {
  const tema = temaDoEsquema(useColorScheme());
  return (
    <Text
      style={{
        color: tema.cores.textoSuave,
        fontSize: tema.tamanhosFonte.base.tamanho,
        lineHeight: tema.tamanhosFonte.base.alturaLinha,
      }}
    >
      {children}
    </Text>
  );
}

export function Botao({
  rotulo,
  aoTocar,
}: {
  readonly rotulo: string;
  readonly aoTocar: () => void;
}) {
  const tema = temaDoEsquema(useColorScheme());
  return (
    <Pressable
      accessibilityRole="button"
      onPress={aoTocar}
      style={{
        backgroundColor: tema.cores.primaria,
        borderRadius: tema.raios.md,
        padding: tema.espacamento[3],
      }}
    >
      <Text style={{ color: tema.cores.primariaTexto, fontWeight: '600', textAlign: 'center' }}>
        {rotulo}
      </Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({ tela: { flex: 1, gap: 16, justifyContent: 'center' } });
