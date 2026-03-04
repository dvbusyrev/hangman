package Class;
import Interface.*;
import java.io.IOException;
import java.io.FileNotFoundException;
import java.io.BufferedReader;
import java.io.FileReader;

public class DisplayImpl implements Display {
    private String[][] menuPictures = new String[5][17];
    private String[] keyboardPicture = new String[6];
    private String[][] manPictures = new String[13][10];

    public DisplayImpl() {
        try (BufferedReader reader = new BufferedReader(new FileReader("GUI.txt"))) {
            String line;
            int i = -1;
            int j = 0;
            int type = 0;
            while ((line = reader.readLine()) != null) {
                if (line.contains("//")) {
                    int index = line.indexOf("//");
                    line = line.substring(0, index);
                }
                if (line.length() > 2 && Character.isDigit(line.charAt(2))) {
                    line = line.replace(" ","");
                    type = Integer.valueOf(line.split(",")[0]);
                    i = Integer.valueOf(line.split(",")[1]);
                    j = 0;
                    line = reader.readLine();
                }
                switch (type) {
                    case 0 -> menuPictures[i][j++] = line;
                    case 1 -> manPictures[i][j++] = line;
                    case 2 -> keyboardPicture[j++] = line;
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    @Override
    public void draw(String inStr) {
        String[][] pictures;
        String[] dataSet = inStr.split(" ");
        String[] picture = new String[2];
        switch (dataSet[0]) {
            case "0" -> {
                pictures = menuPictures;
                if (Character.isDigit(dataSet[1].charAt(0))) {
                    picture = pictures[Character.getNumericValue(dataSet[1].charAt(0))];
                }
            }
            case "1" -> {
                pictures = manPictures;
                if (Character.isDigit(dataSet[1].charAt(0))) {
                    picture = pictures[Character.getNumericValue(dataSet[1].charAt(0))];
                }
            }
            case "2" -> picture = keyboardPicture;
        }
        Display.clear();

        for (String line : picture) {
            if (line != null) {
                System.out.println(line);
            }
        }
    }
}

