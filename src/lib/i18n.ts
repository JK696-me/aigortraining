export type Locale = 'ru' | 'en';

export const translations = {
  ru: {
    // Auth
    signIn: 'Вход',
    signUpTitle: 'Регистрация',
    signUpButton: 'Зарегистрироваться',
    signUpLink: 'Зарегистрироваться',
    signInLink: 'Войти',
    noAccount: 'Нет аккаунта?',
    hasAccount: 'Уже есть аккаунт?',
    password: 'Пароль',
    fillAllFields: 'Заполните все поля',
    passwordTooShort: 'Пароль должен быть не менее 6 символов',
    invalidCredentials: 'Неверный email или пароль',
    userAlreadyExists: 'Пользователь уже зарегистрирован',
    checkEmail: 'Проверьте почту для подтверждения',
    emailConfirmHint: 'Для тестирования можно отключить подтверждение email в настройках Supabase',
    appSubtitle: 'Умный дневник тренировок',
    loggedInAs: 'Вы вошли как',
    
    // Navigation
    home: 'Главная',
    workout: 'Тренировка',
    history: 'История',
    settings: 'Настройки',
    
    // Home
    readyToTrain: 'Готов к тренировке?',
    startWorkout: 'Начать тренировку',
    repeatLastWorkout: 'Повторить прошлую',
    templates: 'Шаблоны',
    create: 'Создать',
    exercises: 'упражнений',
    
    // Workout
    currentWorkout: 'Текущая тренировка',
    addExercise: 'Добавить упражнение',
    finishWorkout: 'Завершить тренировку',
    sets: 'подходов',
    set: 'Подход',
    exercisesCount: 'упражнений',
    
    // Exercise
    weight: 'Вес',
    weightKg: 'Вес (кг)',
    reps: 'Повторы',
    addRep: '+1 повтор',
    addWeight: '+2.5 кг',
    addSet: 'Добавить подход',
    logSet: 'Записать подход',
    rpe: 'RPE',
    rpeLabel: 'RPE (Уровень нагрузки)',
    nextTimeRecommendation: 'Рекомендация на следующий раз',
    basedOnProgress: 'На основе вашего прогресса',
    previousSets: 'Предыдущие подходы',
    backToWorkout: 'К тренировке',
    setOf: 'Подход',
    of: 'из',
    
    // Exercise History
    exerciseHistory: 'История упражнения',
    currentWorkingWeight: 'Рабочий вес',
    totalVolume: 'Общий объём',
    lastSessions: 'Последние сессии',
    back: 'Назад',
    recentSessions: 'Последние сессии',
    progressiveOverload: 'Прогрессивная нагрузка',
    progressMessage: 'Вы увеличили вес 4 сессии подряд!',
    thisMonth: 'в этом месяце',
    lastSession: 'Последняя сессия',
    
    // Settings
    appSettings: 'Настройки',
    customizeExperience: 'Настройте под себя',
    language: 'Язык',
    russian: 'Русский',
    english: 'English',
    theme: 'Тема',
    darkMode: 'Тёмная тема',
    notifications: 'Уведомления',
    profile: 'Профиль',
    account: 'Аккаунт',
    weightUnit: 'Единица веса',
    preferences: 'Настройки',
    about: 'О приложении',
    aboutApp: 'О AIgor',
    guestUser: 'Гость',
    tapToSignIn: 'Нажмите для входа',
    signOut: 'Выйти',
    version: 'Версия',
    
    // 404
    pageNotFound: 'Страница не найдена',
    returnToHome: 'Вернуться на главную',
    
    // Units
    kg: 'кг',
  },
  en: {
    // Auth
    signIn: 'Sign In',
    signUpTitle: 'Sign Up',
    signUpButton: 'Sign Up',
    signUpLink: 'Sign up',
    signInLink: 'Sign in',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    password: 'Password',
    fillAllFields: 'Please fill in all fields',
    passwordTooShort: 'Password must be at least 6 characters',
    invalidCredentials: 'Invalid email or password',
    userAlreadyExists: 'User already registered',
    checkEmail: 'Check your email for confirmation',
    emailConfirmHint: 'For testing, you can disable email confirmation in Supabase settings',
    appSubtitle: 'Smart workout journal',
    loggedInAs: 'Logged in as',
    
    // Navigation
    home: 'Home',
    workout: 'Workout',
    history: 'History',
    settings: 'Settings',
    
    // Home
    readyToTrain: 'Ready to train?',
    startWorkout: 'Start Workout',
    repeatLastWorkout: 'Repeat Last Workout',
    templates: 'Templates',
    create: 'Create',
    exercises: 'exercises',
    
    // Workout
    currentWorkout: 'Current Workout',
    addExercise: 'Add Exercise',
    finishWorkout: 'Finish Workout',
    sets: 'sets',
    set: 'Set',
    exercisesCount: 'exercises',
    
    // Exercise
    weight: 'Weight',
    weightKg: 'Weight (kg)',
    reps: 'Reps',
    addRep: '+1 Rep',
    addWeight: '+2.5 kg',
    addSet: 'Add Set',
    logSet: 'Log Set',
    rpe: 'RPE',
    rpeLabel: 'RPE (Rate of Perceived Exertion)',
    nextTimeRecommendation: 'Next Time Recommendation',
    basedOnProgress: 'Based on your progress',
    previousSets: 'Previous Sets',
    backToWorkout: 'Back to workout',
    setOf: 'Set',
    of: 'of',
    
    // Exercise History
    exerciseHistory: 'Exercise History',
    currentWorkingWeight: 'Working Weight',
    totalVolume: 'Total Volume',
    lastSessions: 'Last Sessions',
    back: 'Back',
    recentSessions: 'Recent Sessions',
    progressiveOverload: 'Progressive Overload',
    progressMessage: "You've increased weight 4 sessions in a row!",
    thisMonth: 'this month',
    lastSession: 'Last session',
    
    // Settings
    appSettings: 'Settings',
    customizeExperience: 'Customize your experience',
    language: 'Language',
    russian: 'Русский',
    english: 'English',
    theme: 'Theme',
    darkMode: 'Dark Mode',
    notifications: 'Notifications',
    profile: 'Profile',
    account: 'Account',
    weightUnit: 'Weight Unit',
    preferences: 'Preferences',
    about: 'About',
    aboutApp: 'About AIgor',
    guestUser: 'Guest User',
    tapToSignIn: 'Tap to sign in',
    signOut: 'Sign Out',
    version: 'Version',
    
    // 404
    pageNotFound: 'Page not found',
    returnToHome: 'Return to Home',
    
    // Units
    kg: 'kg',
  },
};

export type TranslationKey = keyof typeof translations.ru;

export function formatRelativeDate(days: number, locale: Locale): string {
  if (locale === 'ru') {
    if (days === 0) return 'сегодня';
    if (days === 1) return '1 день назад';
    if (days >= 2 && days <= 4) return `${days} дня назад`;
    if (days >= 5 && days <= 7) return `${days} дней назад`;
    return `${Math.floor(days / 7)} неделю назад`;
  }
  
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days <= 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} week ago`;
}

export function formatNumber(num: number, locale: Locale): string {
  return num.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');
}
