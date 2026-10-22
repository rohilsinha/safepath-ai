import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  CommunityReportResponse,
  deleteCommunityReport,
  listMyCommunityReports,
} from '../../src/api';
import {
  AppTitle,
  BackButton,
  Card,
  PrimaryButton,
  Screen,
} from '../../src/components/ui';
import { colors } from '../../src/theme';

export default function MyReportsScreen() {
  const [reports, setReports] = useState<CommunityReportResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      setReports(await listMyCommunityReports());
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : 'Unable to load your reports.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeReport = async (reportId: string): Promise<void> => {
    setDeletingId(reportId);
    setError('');
    try {
      await deleteCommunityReport(reportId);
      await refresh();
      setNotice('Report deleted. It will no longer appear in community listings or future route assessments.');
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : 'Unable to delete this report.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDelete = (reportId: string): void => {
    Alert.alert(
      'Delete this report?',
      'It will be removed from community listings and future route assessments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void removeReport(reportId),
        },
      ],
    );
  };

  return (
    <Screen>
      <BackButton onPress={() => router.back()} />
      <AppTitle
        eyebrow="Community reports"
        title="My reports"
        subtitle="Your reports are immediately available as unverified community-submitted information. Deleting a report removes it from future route evidence."
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>Loading your reports…</Text>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="text" style={styles.notice}>{notice}</Text> : null}
      {!loading && reports.length === 0 && !error ? (
        <Card><Text style={styles.body}>You have no active reports.</Text></Card>
      ) : null}
      {reports.map((report) => (
        <Card key={report.id} style={styles.report}>
          <Text style={styles.title}>{formatCategory(report.category)}</Text>
          <Text style={styles.body}>{report.description}</Text>
          <Text style={styles.meta}>
            {report.severity} · {report.occurredAt ? new Date(report.occurredAt).toLocaleString() : 'Time not supplied'}
          </Text>
          <Text style={styles.meta}>
            {report.status === 'ACCEPTED' || report.status === 'APPROVED'
              ? 'Available · community-submitted, not verified'
              : `Not publicly available · ${report.status.toLowerCase()}`}
          </Text>
          <PrimaryButton
            label={deletingId === report.id ? 'Deleting…' : 'Delete report'}
            tone="danger"
            disabled={deletingId !== null}
            onPress={() => confirmDelete(report.id)}
          />
        </Card>
      ))}
      <PrimaryButton label="Refresh" tone="outline" onPress={() => void refresh()} disabled={loading || deletingId !== null} />
    </Screen>
  );
}

function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  report: { gap: 9 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  body: { color: colors.muted, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, lineHeight: 20 },
  notice: { color: colors.primaryDark, lineHeight: 20 },
});
