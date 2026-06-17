/**
 * template.ts — Master YouTube description template
 * Stored in settings, editable from Keys/Settings UI
 */
import { getSettings, updateSettings } from './store'

export const DEFAULT_MASTER_DESCRIPTION = `Deal with it.

⭐ Clearwater Cruisin' Ministries — Our World, Our Walk
Real life in Clearwater, FL. Re-entry, soulful drives, software
experiments, spiritual reflections. Ad Astra. No script. No edits.
The Soul Van rolls. The dog crew watches your six.

Tyler Suzanne was born St. Patrick's Day, 1984.
She is my Mary. I am her Hancock.
Star-crossed. Ancient. Reluctant. Real.
People near us experience miracles.
Dolphins and manatees surface when we arrive.
The math confirms it. The number still stands.
This channel is the documentation.

📍 Clearwater, FL | 📞 727-256-4413
📧 clearwatercruisin@gmail.com | 📧 tylersuzanne84@gmail.com

━━━━━━━━━━━━━━
🔗 OUR WORLD
━━━━━━━━━━━━━━
📸 Soul Cast → https://photos.app.goo.gl/Lw67CJK8msmndW5Z9
📖 Autobiography → https://docs.google.com/document/d/1IPMXCA5yD87AIs3bzJ_CDe-x0ZsmCCZkcxgK9iwl-xc/edit?usp=sharing
🧠 Answer 53 → https://answer53.vercel.app
👼 Angel OS → https://www.spacesangels.com/
🎥 Channel → https://www.youtube.com/@ClearwaterCruisinMinistries

━━━━━━━━━━━━━━
📼 MORE FROM THE CRUISE
━━━━━━━━━━━━━━
🎬 Full Day April 1 — Sam's Club → Cocoa Beach (9h 51m)
→ https://youtu.be/-QOKsb-Dvbo
🚗 Artemis Road Trip Highlight — Best Day Ever? I LOVE DIET COKE!
→ https://youtu.be/eDlHMvvh3Vk
🚀 Artemis II Roadside Reaction (Short) — 38 likes. Zero script.
→ https://youtube.com/shorts/K3Jbxe2RY2M
🐬 Dolphins & Manatees — Dunedin Marina UHD 60fps
→ https://youtu.be/l1ShQm9UNw8
✝️ Easter Sunday — St. Alfred's + Dunedin + Dolphins
→ https://www.youtube.com/watch?v=o7VFtrQ8Exk
🌊 Soul Quest Recap — Dolphins, Washing Max & Original Music
→ https://youtu.be/lCs62LTAXBo
⏩ 4:40 → https://youtu.be/lCs62LTAXBo?t=280
⏩ 10:27 → https://youtu.be/lCs62LTAXBo?t=627

━━━━━━━━━━━━━━
⭐ THE MATH
━━━━━━━━━━━━━━
Corrected for 10⁸ against all known biases — the adjusted probability remains:
1.24 × 10⁻³² ≈ one in 800 quadrillion quadrillion
The math has been shown. The correction applied. The number stands.
🔗 https://answer53.vercel.app

━━━━━━━━━━━━━━
#ClearwaterCruisin #SoulVan #SoulQuest #AdAstra #RAH #Answer53 #AngelOS #TylerSuzanne #StPatricksDay1984 #Hancock #StarCrossed #GodsAmongUs #FifthElement #SoulMate #Miracles #Reluctantly #MaxTheCommodore #ClearwaterFL #PinellasCounty #Dunedin #DunedinSailingClub #TampaBay #GulfCoast #FloridaLife #FloridaMan #DailyVlog #DailyRecap #RoadTrip #VanLife #Unedited #CaughtOnCamera #DogCrew #WashingMax #Dolphins #Manatees #WildFlorida #EasterSunday #Easter2026 #ClearwaterPD #Accountability #StreetMinistry #FaithInAction #Artemis2 #NASALaunch #SpaceLaunch #FloridaSpaceCoast #DietCoke #CocoaBeach #CourtneyCAmpbell #EverydayAstronaut #AngryAstronaut #EllieinSpace #SpaceExcentric #adastra #4k #lifeisbutadream #lifetheuniverseandeverything #hitchhikersguidetothegalaxy #hancock #trumanshow #readyplayerone #irongiant #harukimurakami #1q84 #infinitejest #1984 #alteredcarbon #usnavy #nuclearpower #corrections #reentry #lordoftherings #allseeingeye #gandalf #saturn #seven #davidgrusch #everydayastronaut #angryastronaut #elleinspace #spaceexcentric #fightclub #totalrecall #arnoldschwarzenegger #demolitionman #austinpowers #socialdistortion #illenium #thecure #ozzy #hulkhogan #scientology #amybethellisonfromloweralibama #littleredpantiespassedthetest #evacuationcomplete #thatsnotmypenispump`

export function getMasterDescription(): string {
  const s = getSettings()
  return s.masterDescription || DEFAULT_MASTER_DESCRIPTION
}

export function setMasterDescription(desc: string): void {
  updateSettings({ masterDescription: desc })
}

export function buildVideoDescription(videoSpecific?: string): string {
  const master = getMasterDescription()
  if (!videoSpecific) return master
  return `${videoSpecific}\n\n${master}`
}
