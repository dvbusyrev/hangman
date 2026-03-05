package Class;
import Interface.*;

import java.util.HashMap;
import java.util.Scanner;

public class GameImpl implements Game {
    Man man;
    Judiciary judiciary;
    Hangman hangman;
    Display console;

    String gameMode;
    String topic;

    public GameImpl() {
        man = new ManImpl();
        judiciary = new JudiciaryImpl();
        hangman = new HangmanImpl();
        console = new DisplayImpl();

        gameMode = chooseGameMode();
        topic = chooseTopic();
        judiciary.pickWord(topic);

        do {
            console.draw(judiciary.getVerdict(gameMode, man));
            console.draw(
            console.drawKeyboard("2,0", man.getPickedLetters());
            hangman.applySanction(judiciary.isCorrectLetter(man.pickLetter()), man);

        } while (!man.isHangedUp());
    }

    public String chooseGameMode() {
        console.draw("0,3");
        HashMap<String, String> gameModes = judiciary.getGameModes();
        for (HashMap.Entry gameMode : gameModes.entrySet()) {
            System.out.println(String.format("%s. %s", gameMode.getKey(), gameMode.getValue()));
        }
        Display.promt();
        Scanner scanner = new Scanner(System.in);
        String choosing = scanner.nextLine();
        if (choosing != null && gameModes.containsKey(choosing)) {
            return gameModes.get(choosing);
        } else {
            console.draw("0,1");
            chooseGameMode();
        }
        return null;
    }

    public String chooseTopic() {
        console.draw("0,4");
        HashMap<String, String> topics = judiciary.getTopics();
        for (HashMap.Entry topic : topics.entrySet()) {
            System.out.println(String.format("%s. %s", topic.getKey(), topic.getValue()));
        }
        Display.promt();
        Scanner scanner = new Scanner(System.in);
        String choosing = scanner.nextLine();
        if (choosing != null && topics.containsKey(choosing)) {
            return topics.get(choosing);
        } else {
            console.draw("0,1");
            chooseTopic();
        }
        return null;
    }

}
