package Interface;

import java.util.HashMap;
import java.util.HashSet;

public interface Judiciary {
    void pickWord(String topic);
    void checkLetter(String letter, Man man, Hangman hangman);
    String getVerdict(String gameMode, Man man);
    HashMap<String, String> getTopics();
    HashMap<String, String> getGameModes();
    String getGuessedWord(HashSet<String> letters);
}
