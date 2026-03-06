package Class;
import Interface.*;

import java.util.HashMap;
import java.util.NoSuchElementException;
import java.util.Scanner;

public class GameImpl implements Game {
    Man man;
    Judiciary judiciary;
    Hangman hangman;
    Display console;
    String language;

    String gameMode;
    String topic;

    public GameImpl(Display console, String language) {
        this.console = console;
        this.language = language;
    }

    public void play() throws InterruptedException {
        man = new ManImpl();
        judiciary = new JudiciaryImpl(language);
        hangman = new HangmanImpl();


        gameMode = chooseGameMode();
        topic = chooseTopic();
        judiciary.pickWord(topic);

        do {
            console.draw(judiciary.getManDrawInstruction(gameMode, man.getMistakes()));
            console.drawWord(judiciary.getGuessedWord(man.getPickedLetters()));
            console.drawKeyboard(man.getPickedLetters());
            judiciary.applyVerdict(gameMode,man.pickLetter(), man, hangman);
        } while (!man.isHangedUp() && !man.isWon());

        if (man.isWon()) {
            console.draw(judiciary.getManDrawInstruction(gameMode, man.getMistakes()));
            console.drawWord(judiciary.getGuessedWord(man.getPickedLetters()));
            console.drawKeyboard(man.getPickedLetters());
//            Thread.sleep(500);
            console.draw(judiciary.getManDrawInstruction(gameMode, man.getMistakes()));
            console.drawWord(judiciary.getGuessedWord(man.getPickedLetters()));
            console.drawGameWin();
            Thread.sleep(2500);
        } else {
            console.drawGameOverPicture();
            console.drawWord(judiciary.getWord());
            console.drawGameOverTitle();
            Thread.sleep(2500);
        }
    }

    private String chooseGameMode() {
        console.draw("0,3");
        HashMap<String, String> gameModes = judiciary.getGameModes();
        for (HashMap.Entry gameMode : gameModes.entrySet()) {
            System.out.println(String.format("%s. %s", gameMode.getKey(), gameMode.getValue()));
        }
        Display.promt();
        String choosing = "";
        try {
            Scanner scanner = new Scanner(System.in);
            choosing = scanner.nextLine();
        } catch (NoSuchElementException e) {
            System.out.println("\nВвод прерван (Ctrl+C). Завершение игры...");
            System.exit(0);
        }
        if (choosing != null && gameModes.containsKey(choosing)) {
            return gameModes.get(choosing);
        } else {
            console.draw("0,1");
            chooseGameMode();
        }
        return chooseGameMode();
    }

    private String chooseTopic() {
        console.draw("0,4");
        HashMap<String, String> topics = judiciary.getTopics();
        for (HashMap.Entry topic : topics.entrySet()) {
            System.out.println(String.format("%s. %s", topic.getKey(), topic.getValue()));
        }
        Display.promt();
        String choosing = "";
        try {
            Scanner scanner = new Scanner(System.in);
            choosing = scanner.nextLine();
        } catch (NoSuchElementException e) {
            System.out.println("\nВвод прерван (Ctrl+C). Завершение игры...");
            System.exit(0);  // корректное завершение
        }
        if (choosing != null && topics.containsKey(choosing)) {
            return topics.get(choosing);
        } else {
            console.draw("0,1");
            chooseTopic();
        }
        return chooseTopic();
    }

}
