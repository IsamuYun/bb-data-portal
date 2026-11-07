import { describe, expect, it } from "vitest";
import { parseQuestionnaire } from "./questionnaire";

// Pages as form.ts writes them (CCB-FORM-0259), trimmed.
const PAGES = [
  `Donor # 1  Date Completed: 7/10/2024
Education
High School  [ ] 1  [ ] 2  [ ] 3  [x] 4  GPA:  3.6
College/University  [ ] 1  [ ] 2  [ ] 3  [x] 4  GPA:  3.3
Major(s): Music Business Management  Minor(s): Creative Marketing
College/University degrees attained:  [x] B.A.  [ ] B.S.  [ ] Other degrees:
Graduate Studies  [ ] 1  [ ] 2  [ ] 3  [ ] 4+  GPA:  Major/Focus:
Graduate degrees attained  [ ] M.A.  [ ] M.S.  [ ] Ph.D.  [ ] M.D.  [ ] J.D.  [ ] D.D.S.
Other degrees/certifications:
CCB-FORM-0259 REV 02  Unauthorized use or distribu(on without prior CCB consent is prohibited  Social Page 1 of 5`,
  `What kind of mechanical skills or abilities do you possess? (check all that apply)
[ ] I can barely replace a light bulb  [x] Model building
[x] Other: Drone repair
How are your mathematical skills?
[ ] Basic (Can balance a checkbook)
[x] Good (e.g., Algebra, Trigonometry, Pre-Calculus)
Awards or Honors:  None
Are you athletic?
[x] Very (e.g., high school captain, all-star, state honors)
Awards or Honors:  Starting pitcher
What is your favorite sport to play?  Basketball
Which sport(s) did you play regularly in high school and/or after? (check all that apply)
[x] Baseball / Softball  [ ] Tennis
[ ] Triathlons  [ ] None
[ ] Other:`,
  `What languages do you speak fluently? (check all that apply)
[x] English  [ ] Japanese
[x] French  [ ] Portuguese
What are your hobbies and talents?
Cycling, running, music
and writing
How do you express your creativity (music, painting, drawing, writing, graphic design,
dancing, singing, etc.)?
Songwriting
What are your favorite foods?  Roast chicken
What is the one thing about you that everybody should know?
I am fair.`,
  `Which subject did you  most  enjoy in school?  History
Academic and professional honors:
None
[ ] Yes  [x] No  [ ] Part-time
Are you a full-time student?
If you are not a full-time student, what is your current occupation?
Digital marketing manager
Current/Past jobs: (do not name your employers)
Music manager
Have you served in the military?
[ ] Yes
[x] No`,
];

describe("parseQuestionnaire", () => {
  it("reads checked options, inline answers and multi-line prose", () => {
    const q = parseQuestionnaire(PAGES);
    expect(q).toMatchObject({
      hsYears: "4",
      hsGpa: "3.6",
      collegeGpa: "3.3",
      majors: "Music Business Management",
      minors: "Creative Marketing",
      degrees: ["B.A."],
      gradYears: null,
      gradGpa: null,
      gradFocus: null,
      otherDegrees: null,
      mechanicalSkills: ["Model building"],
      mechanicalOther: "Drone repair",
      mathSkills: "Good",
      academicAwards: "None",
      athleticLevel: "Very",
      athleticAwards: "Starting pitcher",
      favoriteSport: "Basketball",
      sportsPlayed: ["Baseball / Softball"],
      sportsOther: null,
      languages: ["English", "French"],
      hobbies: "Cycling, running, music and writing",
      creativity: "Songwriting",
      favoriteFoods: "Roast chicken",
      oneThing: "I am fair.",
      favoriteSubject: "History",
      honors: "None",
      fullTimeStudent: "No",
      occupation: "Digital marketing manager",
      pastJobs: "Music manager",
      military: "No",
    });
  });
});
