package Interface;

public interface Judiciary {
    boolean pickWord();
    boolean isCorrectLetter(char letter);
    String getWordWithLetters(Man man);
    boolean isCorrectWord(Man man);
    String giveVerdict(Man man);
}
