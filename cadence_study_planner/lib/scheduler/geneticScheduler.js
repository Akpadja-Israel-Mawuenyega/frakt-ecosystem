/**
 * ─────────────────────── GENETIC TIMETABLE SCHEDULER ───────────────────────
 *
 * Encodes each required weekly course session as a single gene whose value
 * is a slot index (0..TOTAL_SLOTS-1, where TOTAL_SLOTS = days * timeSlots).
 * A population of candidate timetables evolves via tournament selection,
 * uniform crossover and mutation, guided by a penalty function that mirrors
 * the rules a human institutional scheduler would apply:
 *
 * Hard constraints (heavily penalized — a usable timetable should have none):
 *  - A lecturer cannot teach two sessions in the same slot.
 *  - A cohort cannot attend two sessions in the same slot.
 *
 * Soft constraints (penalized lightly, shape the timetable toward something
 * that "looks real"):
 *  - The same course shouldn't repeat for a cohort on the same day.
 *  - A cohort shouldn't be booked for every slot in a single day.
 *  - A cohort shouldn't have an idle slot sandwiched between two booked
 *    slots on the same day (a "gap").
 *  - The same full-day / gap rules apply to lecturers, at a lower weight.
 *  - Each cohort's sessions should be spread evenly across the week.
 *
 * The fittest chromosome from the final generation is refined with a short
 * hill-climbing pass, then converted into the scheduleMatrix shape expected
 * by the Timetable model.
 */

export const TIME_SLOTS = ["08:30-11:30", "11:30-14:30", "14:30-17:30"];
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SLOTS_PER_DAY = TIME_SLOTS.length;
const TOTAL_SLOTS = DAYS.length * SLOTS_PER_DAY;

// ─────────────────────────────── GA TUNING ────────────────────────────────
const POPULATION_SIZE = 80;
const GENERATIONS = 200;
const TOURNAMENT_SIZE = 3;
const CROSSOVER_RATE = 0.85;
const MUTATION_RATE = 0.04;
const ELITE_COUNT = 4;
const REFINEMENT_PASSES = 3;

// Penalty weights. Hard constraints sit far above soft ones so the GA always
// prefers a clash-free (if slightly lumpy) week over a tidy week that
// double-books someone.
const PENALTY = {
  lecturerClash: 50,
  cohortClash: 50,
  sameCourseSameDay: 8,
  cohortFullDay: 4,
  cohortGap: 3,
  lecturerFullDay: 2,
  lecturerGap: 1,
  weekImbalance: 1,
};

// ──────────────────────────────── HELPERS ─────────────────────────────────

const dayOfSlot = (slot) => Math.floor(slot / SLOTS_PER_DAY);
const timeOfSlot = (slot) => slot % SLOTS_PER_DAY;

/**
 * Flattens course demands into individual weekly sessions — one entry per
 * required slot, since the GA assigns slots to sessions one at a time.
 *
 * @param {Array<Object>} demands - Course demand documents from MongoDB.
 * @returns {Array<Object>} Flat list of { cohort, lecturer, courseCode, courseName }.
 */
const buildSessions = (demands) => {
  const sessions = [];
  for (const demand of demands) {
    const count = Math.max(1, demand.weeklySlotsRequired || 1);
    for (let i = 0; i < count; i++) {
      sessions.push({
        cohort: demand.cohort,
        lecturer: demand.lecturer,
        courseCode: demand.courseCode,
        courseName: demand.courseName,
      });
    }
  }
  return sessions;
};

const randomChromosome = (numSessions) =>
  Array.from({ length: numSessions }, () => Math.floor(Math.random() * TOTAL_SLOTS));

/**
 * A "gap" exists when a set of booked time-slot indices isn't contiguous —
 * e.g. {0, 2} booked but 1 free leaves an awkward idle block in the middle
 * of the day.
 */
const hasGap = (slotSet) => {
  if (slotSet.size < 2) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const s of slotSet) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  return max - min + 1 > slotSet.size;
};

/**
 * Scores a candidate chromosome. Lower is better; 0 means a clash-free,
 * evenly-spread timetable.
 *
 * @param {number[]} chromosome - One slot index (0..TOTAL_SLOTS-1) per session.
 * @param {Array<Object>} sessions - Flattened sessions, parallel to chromosome.
 * @returns {number} Total penalty.
 */
const computePenalty = (chromosome, sessions) => {
  const bySlot = Array.from({ length: TOTAL_SLOTS }, () => []);
  chromosome.forEach((slot, i) => bySlot[slot].push(sessions[i]));

  let penalty = 0;

  // Hard constraints: clashes within the same slot.
  for (const group of bySlot) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].lecturer === group[j].lecturer) penalty += PENALTY.lecturerClash;
        if (group[i].cohort === group[j].cohort) penalty += PENALTY.cohortClash;
      }
    }
  }

  // Soft constraints: per-day shape of each cohort's and lecturer's week.
  const cohortDaySlots = new Map(); // `${cohort}|${day}` -> Set<timeIndex>
  const lecturerDaySlots = new Map(); // `${lecturer}|${day}` -> Set<timeIndex>
  const cohortCourseDayCount = new Map(); // `${cohort}|${courseCode}|${day}` -> count
  const cohortDayCounts = new Map(); // cohort -> [count per day]

  chromosome.forEach((slot, i) => {
    const session = sessions[i];
    const day = dayOfSlot(slot);
    const t = timeOfSlot(slot);

    const cKey = `${session.cohort}|${day}`;
    if (!cohortDaySlots.has(cKey)) cohortDaySlots.set(cKey, new Set());
    cohortDaySlots.get(cKey).add(t);

    const lKey = `${session.lecturer}|${day}`;
    if (!lecturerDaySlots.has(lKey)) lecturerDaySlots.set(lKey, new Set());
    lecturerDaySlots.get(lKey).add(t);

    const courseKey = `${session.cohort}|${session.courseCode}|${day}`;
    cohortCourseDayCount.set(courseKey, (cohortCourseDayCount.get(courseKey) || 0) + 1);

    if (!cohortDayCounts.has(session.cohort)) {
      cohortDayCounts.set(session.cohort, Array(DAYS.length).fill(0));
    }
    cohortDayCounts.get(session.cohort)[day] += 1;
  });

  for (const count of cohortCourseDayCount.values()) {
    if (count > 1) penalty += (count - 1) * PENALTY.sameCourseSameDay;
  }

  for (const slots of cohortDaySlots.values()) {
    if (slots.size === SLOTS_PER_DAY) penalty += PENALTY.cohortFullDay;
    else if (hasGap(slots)) penalty += PENALTY.cohortGap;
  }

  for (const slots of lecturerDaySlots.values()) {
    if (slots.size === SLOTS_PER_DAY) penalty += PENALTY.lecturerFullDay;
    else if (hasGap(slots)) penalty += PENALTY.lecturerGap;
  }

  for (const counts of cohortDayCounts.values()) {
    const total = counts.reduce((sum, c) => sum + c, 0);
    const avg = total / DAYS.length;
    const deviation = counts.reduce((sum, c) => sum + Math.abs(c - avg), 0);
    penalty += deviation * PENALTY.weekImbalance;
  }

  return penalty;
};

// ─────────────────────────────── GA OPERATORS ─────────────────────────────

const tournamentSelect = (population, fitnesses) => {
  let best = null;
  let bestFitness = Infinity;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const idx = Math.floor(Math.random() * population.length);
    if (fitnesses[idx] < bestFitness) {
      bestFitness = fitnesses[idx];
      best = population[idx];
    }
  }
  return best;
};

const crossover = (parentA, parentB) => {
  if (Math.random() > CROSSOVER_RATE) return [...parentA];
  return parentA.map((gene, i) => (Math.random() < 0.5 ? gene : parentB[i]));
};

const mutate = (chromosome) =>
  chromosome.map((gene) =>
    Math.random() < MUTATION_RATE ? Math.floor(Math.random() * TOTAL_SLOTS) : gene
  );

/**
 * Hill-climbing refinement: for each session in turn, try every slot and
 * keep whichever placement most reduces total penalty. Cleans up the
 * residual roughness the GA leaves behind.
 *
 * @returns {{chromosome: number[], penalty: number}}
 */
const refine = (chromosome, sessions) => {
  const current = [...chromosome];
  let currentPenalty = computePenalty(current, sessions);

  for (let pass = 0; pass < REFINEMENT_PASSES; pass++) {
    let improved = false;

    for (let i = 0; i < current.length; i++) {
      const original = current[i];
      let bestSlot = original;
      let bestPenalty = currentPenalty;

      for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
        if (slot === original) continue;
        current[i] = slot;
        const penalty = computePenalty(current, sessions);
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestSlot = slot;
        }
      }

      current[i] = bestSlot;
      currentPenalty = bestPenalty;
      if (bestSlot !== original) improved = true;
    }

    if (!improved) break;
  }

  return { chromosome: current, penalty: currentPenalty };
};

// ──────────────────────────────── MATRIX OUTPUT ────────────────────────────

/**
 * Builds a blank weekly schedule matrix keyed by day, matching the shape
 * stored on the Timetable model.
 */
const initializeEmptyMatrix = () => {
  const matrix = {};
  DAYS.forEach((day) => {
    matrix[day] = TIME_SLOTS.map((slot) => ({
      timeSlot: slot,
      assignments: [],
    }));
  });
  return matrix;
};

const buildMatrix = (chromosome, sessions) => {
  const matrix = initializeEmptyMatrix();

  chromosome.forEach((slot, i) => {
    const session = sessions[i];
    const day = DAYS[dayOfSlot(slot)];
    const timeSlot = TIME_SLOTS[timeOfSlot(slot)];

    matrix[day]
      .find((entry) => entry.timeSlot === timeSlot)
      .assignments.push({
        assignedClass: session.cohort,
        assignedCourse: {
          code: session.courseCode,
          name: session.courseName,
        },
        assignedLecturer: session.lecturer,
      });
  });

  return matrix;
};

/**
 * Logs any hard-constraint clashes that survived evolution + refinement —
 * mirrors the old scheduler's "unable to allocate" warnings.
 */
const logUnresolvedClashes = (chromosome, sessions) => {
  const bySlot = Array.from({ length: TOTAL_SLOTS }, () => []);
  chromosome.forEach((slot, i) => bySlot[slot].push({ slot, session: sessions[i] }));

  bySlot.forEach((group) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i].session;
        const b = group[j].session;
        const day = DAYS[dayOfSlot(group[i].slot)];
        const timeSlot = TIME_SLOTS[timeOfSlot(group[i].slot)];

        if (a.lecturer === b.lecturer) {
          console.warn(
            `Unresolved lecturer clash: ${a.lecturer} double-booked on ${day} ${timeSlot} (${a.courseCode} / ${b.courseCode})`
          );
        }
        if (a.cohort === b.cohort) {
          console.warn(
            `Unresolved cohort clash: ${a.cohort} double-booked on ${day} ${timeSlot} (${a.courseCode} / ${b.courseCode})`
          );
        }
      }
    }
  });
};

// ──────────────────────────────── PUBLIC API ───────────────────────────────

/**
 * Runs the genetic algorithm against a set of course demands and returns a
 * fully populated schedule matrix, in the same shape the legacy greedy
 * scheduler produced.
 *
 * Demands that cannot be fully reconciled (e.g. a cohort or lecturer with
 * more weekly slots than the week has room for) are still placed — the GA
 * minimizes total clashes rather than refusing to allocate — and any
 * remaining hard-constraint clashes are flagged with a console warning.
 *
 * @param {Array<Object>} demands - Course demand documents from MongoDB.
 * @param {number} demands[].weeklySlotsRequired - How many slots per week this course needs.
 * @param {string} demands[].cohort - The student cohort for this course.
 * @param {string} demands[].lecturer - The assigned lecturer's name.
 * @param {string} demands[].courseCode - Short course code (e.g. "CS301").
 * @param {string} demands[].courseName - Full course name.
 * @returns {Object} A schedule matrix of shape { [day]: [{ timeSlot, assignments[] }] }
 */
export const runGeneticScheduler = (demands) => {
  const sessions = buildSessions(demands);

  if (sessions.length === 0) {
    return initializeEmptyMatrix();
  }

  let population = Array.from({ length: POPULATION_SIZE }, () =>
    randomChromosome(sessions.length)
  );

  let best = population[0];
  let bestPenalty = Infinity;

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const fitnesses = population.map((chromosome) => computePenalty(chromosome, sessions));

    for (let i = 0; i < population.length; i++) {
      if (fitnesses[i] < bestPenalty) {
        bestPenalty = fitnesses[i];
        best = population[i];
      }
    }

    if (bestPenalty === 0) break;

    const ranked = population
      .map((chromosome, i) => ({ chromosome, fitness: fitnesses[i] }))
      .sort((a, b) => a.fitness - b.fitness);

    const nextGeneration = ranked.slice(0, ELITE_COUNT).map(({ chromosome }) => [...chromosome]);

    while (nextGeneration.length < POPULATION_SIZE) {
      const parentA = tournamentSelect(population, fitnesses);
      const parentB = tournamentSelect(population, fitnesses);
      nextGeneration.push(mutate(crossover(parentA, parentB)));
    }

    population = nextGeneration;
  }

  const { chromosome: refined, penalty: finalPenalty } = refine(best, sessions);

  if (finalPenalty > 0) {
    logUnresolvedClashes(refined, sessions);
  }

  return buildMatrix(refined, sessions);
};
