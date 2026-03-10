package Class;
import Interface.*;

import java.util.*;

public class GameImpl implements Game {
    private Man man;
    private Judiciary judiciary;
    private Hangman hangman;
    private Display display;
    private String language;
    private String gameMode;
    private String topic;
    private Scanner scanner;

    public GameImpl(Display display, String language, Scanner scanner) {
        this.display = display;
        this.language = language;
        this.scanner = scanner;
    }

    public void play() throws InterruptedException {
        man = new ManImpl();
        judiciary = new JudiciaryImpl(language);
        hangman = new HangmanImpl();

        gameMode = chooseGameMode();
        topic = chooseTopic();
        judiciary.pickWord(topic);

        int manMistakes;
        DrawInstruction instr;
        HashSet<String> manPickedLetters;
        String guessedWord;

        do {
            manMistakes = man.getMistakes();
            instr = judiciary.getManDrawInstruction(gameMode, manMistakes);
            manPickedLetters = man.getPickedLetters();
            guessedWord = judiciary.getGuessedWord(manPickedLetters);

            display.man(instr, manMistakes, guessedWord, manPickedLetters);

            String pickedLetter = man.pickLetter(display, scanner, language);
            judiciary.applyVerdict(gameMode, pickedLetter, man, hangman);

        } while (!man.isHangedUp() && !man.isWon());

        if (man.isWon()) {
            display.gameWin(instr, manMistakes, judiciary.getWord());
            Thread.sleep(2500);
        } else {
            display.gameOver(manMistakes, judiciary.getWord());
            Thread.sleep(2500);
        }
    }

    private String chooseGameMode() {
        display.chooseGameMode();
        LinkedHashMap<String, String> gameModes = judiciary.getGameModes();
        for (HashMap.Entry gameMode : gameModes.entrySet()) {
            System.out.println(String.format("%s. %s", gameMode.getKey(), gameMode.getValue()));
        }
        while (true) {
            display.input();
            String choosing;
            try {
                choosing = scanner.nextLine();
            } catch (NoSuchElementException e) {
                display.interruption();
                System.exit(0);
                return null;
            }
            if (gameModes.containsKey(choosing)) {
                return gameModes.get(choosing);
            } else {
                display.incorrectInput();
                chooseGameMode();
            }
        }
    }

    private String chooseTopic() {
        display.chooseTopic();
        HashMap<String, String> topics = judiciary.getTopics();
        for (HashMap.Entry topic : topics.entrySet()) {
            System.out.println(String.format("%s. %s", topic.getKey(), topic.getValue()));
        }
        while (true) {
            display.input();
            String choosing;
            try {
                choosing = scanner.nextLine();
            } catch (NoSuchElementException e) {
                display.interruption();
                System.exit(0);
                return null;
            }

            if (topics.containsKey(choosing)) {
                return topics.get(choosing);
            } else {
                display.incorrectInput();
                chooseTopic();
            }
        }
    }
}
