import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "../config/constants";
import { useTheme } from "../hooks";
import { usePrefsStore } from "../store/prefs.store";
import { SUPPORTED, type LanguageCode } from "../i18n";

/**
 * Language row for the profile Display section. Choosing a language persists it, so it survives a
 * restart and overrides the device locale from then on; the app ships every bundle, so switching is
 * instant and offline.
 */
export function LanguagePicker() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const saved = usePrefsStore((s) => s.language);
  const setSaved = usePrefsStore((s) => s.setLanguage);
  const active = (saved ?? i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0];

  // Storing the choice is enough: src/i18n/bootstrap subscribes to the store and switches i18next.
  const choose = (code: LanguageCode) => setSaved(code);

  return (
    <>
      <View style={styles.divider} />
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: theme.primary + "15" }]}>
          <Ionicons name="language-outline" size={18} color={theme.primary} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        <Text style={styles.label}>{t("settings.language")}</Text>
      </View>
      <View style={styles.grid}>
        {SUPPORTED.map((lang) => {
          const isActive = active === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={lang.label}
              testID={`language-${lang.code}`}
              style={[
                styles.pill,
                { backgroundColor: theme.background },
                isActive && { borderColor: theme.primary, backgroundColor: theme.primary + "12" },
              ]}
              onPress={() => choose(lang.code)}
            >
              <Text style={[styles.pillLabel, isActive && { color: theme.primary }]}>{lang.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: COLORS.border.default, marginVertical: SPACING.md },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  iconBox: { width: 32, height: 32, borderRadius: BORDER_RADIUS.md, alignItems: "center", justifyContent: "center" },
  label: { fontSize: FONTS.sizes.md, fontWeight: "500", color: COLORS.text.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md },
  pill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  pillLabel: { fontSize: FONTS.sizes.xs, fontWeight: "600", color: COLORS.text.secondary },
});
