import {
  type Discipline,
  type Topic,
  type Subtopic,
  type AppSettings,
  type DailyPlan,
  type Task,
  type EnemIncidence,
} from '../types';
import { addDays, getDayOfWeek, getTodayDateString, getDaysBetween } from './dateUtils';

// --- Constants for ENEM 2025 Dates ---
const ENEM_DATE_1 = '2025-11-09';
const ENEM_DATE_2 = '2025-11-16';
const DISCIPLINES_GROUP_1 = ['ling', 'hum', 'red']; // For DATE_1
const DISCIPLINES_GROUP_2 = ['mat', 'nat'];      // For DATE_2

// Simple UUID generator to avoid adding a dependency
export const uuidv4 = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const isStudyDay = (date: string, settings: AppSettings): boolean => {
  const dayOfWeek = getDayOfWeek(date); // 0=Sun, 1=Mon, ..., 6=Sat
  const studyDays = settings.studyDaysPerWeek;

  if (studyDays >= 7) return true;
  if (studyDays === 6) return dayOfWeek !== 0; // Sunday is rest day
  if (studyDays === 5) return dayOfWeek !== 0 && dayOfWeek !== 6; // Weekend is rest day

  const studyDayMap: { [key: number]: number[] } = {
    1: [1], // Monday
    2: [1, 3], // Mon, Wed
    3: [1, 3, 5], // Mon, Wed, Fri
    4: [1, 2, 4, 5], // Mon, Tue, Thu, Fri
  };

  return studyDayMap[studyDays]?.includes(dayOfWeek) ?? false;
};

const calculateSubtopicPriority = (subtopic: Subtopic, discipline: Discipline, today: string): number => {
  let score = 0;
  
  // Base scores
  score += (discipline.weight || 1) * 20;
  score += (subtopic.difficulty || 3) * 5;
  const incidenceMap: Record<EnemIncidence, number> = { baixa: 1, media: 5, alta: 10 };
  score += incidenceMap[subtopic.enemIncidence] || 5;
  score += (6 - (subtopic.confidence || 3)) * 10;

  // Recency factor (for new study topics, not reviews)
  if (subtopic.lastStudied) {
    const daysSince = getDaysBetween(subtopic.lastStudied, today);
    
    // Decay for very recent studies to avoid repetition
    if (daysSince <= 3) {
      score *= 0.1; // Strong penalty
    } else if (daysSince <= 7) {
      score *= 0.5; // Moderate penalty
    } 
    // Bonus for older studies
    else if (daysSince > 90) score += 100;
    else if (daysSince > 30) score += 50;
    else score += 15; // > 7 and <= 30 days
  } else {
    // Highest priority for unstudied topics
    score += 1000;
  }

  // ENEM Date Factor
  if (today < ENEM_DATE_1) {
    // Before the first exam, prioritize Group 1 subjects
    if (DISCIPLINES_GROUP_1.includes(discipline.id)) {
      score += 150;
    }
  } else if (today >= ENEM_DATE_1 && today < ENEM_DATE_2) {
    // Between exams, heavily prioritize Group 2 subjects
    if (DISCIPLINES_GROUP_2.includes(discipline.id)) {
      score += 500; // Crunch time boost
    } else if (DISCIPLINES_GROUP_1.includes(discipline.id)) {
      score *= 0.01; // Heavy penalty, exam is over
    }
  }

  return score;
};

const createReviewTasks = (disciplines: Discipline[], settings: AppSettings): (Task & { reviewDateStr: string })[] => {
  if (!settings.autoReview) return [];

  const reviewTasks: (Task & { reviewDateStr: string })[] = [];
  const today = getTodayDateString();

  disciplines.forEach(discipline => {
    discipline.topics.forEach(topic => {
        topic.subtopics.forEach(subtopic => {
            if (subtopic.lastStudied && subtopic.history.length > 0) {
                const historyCount = subtopic.history.length;
                const cadenceIndex = historyCount - 1;
        
                if (cadenceIndex < settings.baseCadence.length) {
                  const baseInterval = settings.baseCadence[cadenceIndex];
                
                  const confidenceFactor = subtopic.confidence <= 2 ? settings.confidenceFactors.low :
                                           subtopic.confidence >= 4 ? settings.confidenceFactors.high : 1;
                
                  const nextInterval = Math.max(1, Math.round(baseInterval * confidenceFactor));
        
                  const reviewDateStr = addDays(subtopic.lastStudied, nextInterval);
                  
                  if (reviewDateStr >= today) {
                    reviewTasks.push({
                      id: uuidv4(),
                      subtopicId: subtopic.id,
                      topicId: topic.id,
                      disciplineId: discipline.id,
                      subtopicName: subtopic.name,
                      topicName: topic.name,
                      disciplineName: discipline.name,
                      type: 'review',
                      duration: 25,
                      completed: false,
                      reviewDateStr: reviewDateStr,
                    });
                  }
                }
              }
        });
    });
  });

  return reviewTasks;
};

export const reorganizeAgenda = (
  disciplines: Discipline[],
  settings: AppSettings
): Record<string, DailyPlan> => {
  const plans: Record<string, DailyPlan> = {};
  const today = getTodayDateString();
  const planningHorizon = 90;

  if (!disciplines || disciplines.length === 0) {
    return {};
  }
  
  const reviewTasks = createReviewTasks(disciplines, settings);
  const subtopicsWithUpcomingReviews = new Set(reviewTasks.map(t => t.subtopicId));

  const studyCandidates: (Subtopic & { discipline: Discipline, topic: Topic, priority: number })[] = disciplines
    .flatMap(d => d.topics.flatMap(t => t.subtopics.map(st => ({ ...st, topic: t, discipline: d }))))
    .filter(st => !st.lastStudied || !subtopicsWithUpcomingReviews.has(st.id))
    .map(stWithParents => ({
      ...stWithParents,
      priority: calculateSubtopicPriority(stWithParents, stWithParents.discipline, today),
    }))
    .sort((a, b) => b.priority - a.priority);

  for (let i = 0; i < planningHorizon; i++) {
    const dateStr = addDays(today, i);
    plans[dateStr] = {
      date: dateStr,
      tasks: [],
      isRestDay: !isStudyDay(dateStr, settings),
    };
  }

  reviewTasks.forEach(task => {
    const dayPlan = plans[task.reviewDateStr];
    if (dayPlan && !dayPlan.isRestDay) {
      const timeSpent = dayPlan.tasks.reduce((sum, t) => sum + t.duration, 0);
      const reviewCount = dayPlan.tasks.filter(t => t.type === 'review').length;

      if (timeSpent + task.duration <= settings.dailyStudyMinutes && reviewCount < settings.maxReviewsPerDay) {
        dayPlan.tasks.push(task);
      }
    }
  });

  for (let i = 0; i < planningHorizon; i++) {
    const dateStr = addDays(today, i);
    const dayPlan = plans[dateStr];
    if (!dayPlan || dayPlan.isRestDay) continue;

    let timeSpentToday = dayPlan.tasks.reduce((sum, t) => sum + t.duration, 0);
    const disciplineCountToday = dayPlan.tasks.reduce((acc, t) => {
        acc[t.disciplineId] = (acc[t.disciplineId] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    let potentialSubtopicIndex = 0;
    while(timeSpentToday < settings.dailyStudyMinutes && potentialSubtopicIndex < studyCandidates.length) {
        const subtopic = studyCandidates[potentialSubtopicIndex];
        const taskDuration = 45;

        if (
            timeSpentToday + taskDuration <= settings.dailyStudyMinutes &&
            (disciplineCountToday[subtopic.discipline.id] || 0) < settings.maxTasksPerDisciplinePerDay
        ) {
            dayPlan.tasks.push({
                id: uuidv4(),
                subtopicId: subtopic.id,
                topicId: subtopic.topic.id,
                disciplineId: subtopic.discipline.id,
                subtopicName: subtopic.name,
                topicName: subtopic.topic.name,
                disciplineName: subtopic.discipline.name,
                type: 'study',
                duration: taskDuration,
                completed: false,
            });

            timeSpentToday += taskDuration;
            disciplineCountToday[subtopic.discipline.id] = (disciplineCountToday[subtopic.discipline.id] || 0) + 1;
            
            studyCandidates.splice(potentialSubtopicIndex, 1);
        } else {
            potentialSubtopicIndex++;
        }
    }
  }

  return plans;
};
