import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  generateAvatar,
  regenerateAvatar,
  isAvatarGenerationAvailable,
  AvatarType,
} from '../services/avatarGeneration.service';

interface UseAvatarGenerationOptions {
  onSuccess?: (imageUrl: string) => void;
  onError?: (error: string) => void;
}

export function useAvatarGeneration(options: UseAvatarGenerationOptions = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = isAvatarGenerationAvailable();

  const generate = useCallback(async (
    name: string,
    type: AvatarType,
    entityId: string
  ) => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateAvatar(name, type, entityId);

      if (result.success && result.imageUrl) {
        options.onSuccess?.(result.imageUrl);
        return result.imageUrl;
      } else {
        const errorMsg = result.error || 'Failed to generate avatar';
        setError(errorMsg);
        options.onError?.(errorMsg);
        Alert.alert('Generation Failed', errorMsg);
        return null;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMsg);
      options.onError?.(errorMsg);
      Alert.alert('Error', errorMsg);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [options]);

  const regenerate = useCallback(async (
    name: string,
    type: AvatarType,
    entityId: string
  ) => {
    return new Promise<string | null>((resolve) => {
      Alert.alert(
        'Regenerate Avatar',
        'This will create a new AI-generated avatar. Continue?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Generate',
            onPress: async () => {
              setIsGenerating(true);
              setError(null);

              try {
                const result = await regenerateAvatar(name, type, entityId);

                if (result.success && result.imageUrl) {
                  options.onSuccess?.(result.imageUrl);
                  resolve(result.imageUrl);
                } else {
                  const errorMsg = result.error || 'Failed to regenerate avatar';
                  setError(errorMsg);
                  options.onError?.(errorMsg);
                  Alert.alert('Generation Failed', errorMsg);
                  resolve(null);
                }
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
                setError(errorMsg);
                options.onError?.(errorMsg);
                Alert.alert('Error', errorMsg);
                resolve(null);
              } finally {
                setIsGenerating(false);
              }
            },
          },
        ]
      );
    });
  }, [options]);

  return {
    generate,
    regenerate,
    isGenerating,
    isAvailable,
    error,
  };
}
