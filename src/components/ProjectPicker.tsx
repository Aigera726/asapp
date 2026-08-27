import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { database } from '@/database';
import Project from '@/database/models/Project';
import { Icon } from './Icon';
import { EmptyState } from './ui';
import { T } from '@/theme';

/**
 * Выбор объекта/проекта. Практически каждая запись (движение материала,
 * проверка, предписание, отклонение) привязана к проекту, поэтому выбор
 * вынесен в один компонент, а не повторяется в каждой форме.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const sub = database.collections
      .get<Project>('projects')
      .query()
      .observe()
      .subscribe(setProjects);
    return () => sub.unsubscribe();
  }, []);

  return projects;
}

export function ProjectPicker({
  projects,
  value,
  onChange,
  placeholder = 'Выберите объект',
}: {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === value);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Icon name="office-building-outline" size={18} color={T.colors.primary} />
        <Text
          style={[styles.triggerText, !selected && styles.triggerPlaceholder]}
          numberOfLines={1}
        >
          {selected ? selected.name : placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={T.colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Объект</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Icon name="close" size={22} color={T.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={projects}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.sheetList}
              renderItem={({ item }) => {
                const active = item.id === value;
                return (
                  <TouchableOpacity
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {active ? <Icon name="check" size={18} color={T.colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <EmptyState
                  icon="office-building-outline"
                  title="Объектов нет"
                  text="Синхронизируйте данные — список объектов приходит с сервера."
                />
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.md + 2,
  },
  triggerText: { ...T.font.body, color: T.colors.textPrimary, flex: 1 },
  triggerPlaceholder: { color: T.colors.textDisabled },

  overlay: { flex: 1, backgroundColor: T.colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.colors.canvas,
    borderTopLeftRadius: T.radius.xxl,
    borderTopRightRadius: T.radius.xxl,
    paddingTop: T.spacing.xl,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.spacing.xl,
    marginBottom: T.spacing.lg,
  },
  sheetTitle: { ...T.font.h2, color: T.colors.textPrimary },
  sheetList: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.md,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    padding: T.spacing.lg,
    marginBottom: T.spacing.sm,
  },
  optionActive: { borderColor: T.colors.primary, backgroundColor: T.colors.primarySoft },
  optionText: { ...T.font.body, color: T.colors.textPrimary, flex: 1 },
  optionTextActive: { color: T.colors.primary, fontWeight: '700' },
});
